---
title: "My CLI got slow, so I fixed it"
description: "Spawning 400 git subprocesses made my CLI crawl. Deduping, threading, and caching brought it from 10 seconds to 200 milliseconds."
pubDate: 2026-03-09
tags: ["python", "performance", "cli"]
---

I built [Grove](https://github.com/nicksenap/grove), a CLI tool for managing git worktrees across multiple repos. The main workflow is `gw create`: pick some repos, specify a branch, and Grove sets up worktrees for all of them at once.

It worked great with a handful of repos. Until it no longer did.

## The symptom

My config points at two directories: one with ~35 repos (work), another with ~180 repos (personal projects, forks, experiments). When I ran `gw create` interactively, there was a very noticeable lag before the repo picker appeared. Multiple seconds of just... waiting.

## Finding the bottleneck

Grove's interactive mode calls `discover_repos()`, which recursively scans directories for git repos and identifies each one by its remote URL (so forks and duplicates get deduped). That means running `git remote get-url origin` for every repo it finds.

Worse, I had a bug. Each repo was calling `remote_url()` **twice**: once to get the URL for deduplication, then again inside `_repo_display_name()` to derive the display name. So ~200 repos meant ~400 sequential subprocess spawns.

Each `git remote get-url` takes around 10-50ms. At 400 calls, sequentially, that's 4-20 seconds of wall time doing nothing useful.

## The fix

Fixing the double call was trivial. Just reuse the URL we already have:

```python
# Before: two subprocess calls per repo
url = remote_url(entry)
display = _repo_display_name(entry)  # calls remote_url() again

# After: one call, reuse the result
url = url_map.get(entry)
display = _display_name_from_url(url, entry.name)
```

Still slow though. 200 sequential subprocess calls is 200 sequential subprocess calls. Since git calls are I/O-bound and the CPU just sits idle waiting for each process, threading helps a lot here:

```python
with ThreadPoolExecutor(max_workers=16) as pool:
    futures = {pool.submit(remote_url, p): p for p in repos_to_resolve}
    for future in as_completed(futures):
        url_map[futures[future]] = future.result()
```

That turned 200 sequential calls into ~13 batches of 16 and brought the cold-start down to about 1.4s.

The last layer was a disk cache. Remote URLs almost never change, so there's no reason to re-resolve them on every run. I cache them in `~/.grove/cache/remotes.json`, keyed by repo path and invalidated by `.git/config` mtime:

```python
def _resolve_remote_cached(repo_path, cache, now):
    key = str(repo_path.resolve())
    entry = cache.get(key)
    if entry is None:
        return _CACHE_MISS
    if entry["mtime"] != git_config_mtime(repo_path):
        return _CACHE_MISS
    if now - entry["ts"] > 86400:  # 24h TTL
        return _CACHE_MISS
    return entry["url"] or None
```

`.git/config` mtime works well as an invalidation key. It changes whenever remotes are added or modified, which is the only scenario where the cached URL would go stale.

## The result

| Scenario | Before | After |
|----------|--------|-------|
| Every run | ~5-10s | — |
| Cold (first run) | — | 1.4s |
| Warm (cached) | — | 0.2s |

The warm path spawns zero subprocesses. It just reads directory entries and a JSON file.

## The pattern

This is really just the **N+1 problem** wearing a different hat. Instead of N+1 database queries, it's N+1 subprocess spawns. The fix is the same too: batch the work, cache the results.

The thing that got me was how long it took to notice. With 5 repos everything felt instant, so I never questioned the approach. It only fell apart at ~200. Separating the filesystem scan (cheap) from the remote resolution (expensive) made it obvious where the time was going. Once you see it as a batch problem, threading and caching fall out naturally.

The code is on [GitHub](https://github.com/nicksenap/grove) if you want to look at the actual implementation. The interesting bits are in `discover.py`.
