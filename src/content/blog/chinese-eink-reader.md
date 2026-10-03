---
title: "Chinese eink reader"
description: "Notes from a weekend trying to get my own files onto a Hanvon Clear 7 锦鲤. Finder wouldn't mount it, the shelf wouldn't notice the files, and the Android settings page had no icon."
pubDate: 2026-09-28
tags: ["hardware", "android", "eink"]
---

I bought a Hanvon Clear 7 锦鲤 for the screen. Oxide backplane, fast page turns, thin aluminum body, a front light. The thing I actually wanted to do with it was smaller: keep my own files, put them in folders, read them.

A cheap Xteink already does that. Pull the SD card, arrange the books, put the card back, and the shelf matches the folder. The Clear 7 has no card. It has Android, a shelf, and a cable, and I assumed the cable would be enough.

Here's what I ran into.

## Finder never showed it

Plug it in, set File transfer, and nothing appears in the sidebar. I spent a while assuming this was a Hanvon bug. It isn't, or not mostly.

"File transfer" on Android means MTP. MTP is a media protocol: objects with numeric ids, not a filesystem. A folder is an object of type "association," and rename and move are optional. A lot of devices implement them badly. This one doesn't keep a session open across reconnects the way a desktop expects.

The thing Finder understands is USB mass storage, and Android dropped that years ago, because the phone and the computer can't both mount the same partition. I went looking for an APK that would turn it back on. There isn't one. The gadget mode is chosen by the kernel, and Android 14 has no API for an app to change it.

What macOS does have is a PTP driver, the camera protocol, which is a subset of the same spec. It does not have an MTP driver. So when the Clear 7 enumerates, macOS grabs it with `ptpcamerad` and Image Capture, and every real MTP client has to fight that process for the USB interface. That's the "busy" error. On Windows, and on most Linux desktops, the same reader just shows up, because those ship an MTP client. On a Mac it's a camera that happens to contain books.

[OpenMTP](https://github.com/ganeshrvel/openmtp) gets around this by ignoring [libmtp](https://github.com/libmtp/libmtp). It ships its own `mtp-cli`, opens one USB session, and holds it. The tool I wrote first did the opposite. It linked against libmtp, opened a session, closed it, and libmtp reset the port on the way out. macOS rejects the reset. Then you replug. The reader was fine the whole time. That tool is [clear7](https://github.com/nicksenap/clear7), and it's stale now. adb replaced it, which I'll get to.

So: Android won't be a USB disk, macOS only speaks the camera dialect of the protocol Android does offer, and Hanvon's own network service (next) is a one-folder inbox. Each of those is a reasonable decision. None of them talks to the next.

## The Wi-Fi page is a drop box

The reader has a transfer page at `http://192.168.0.105:9310/`. I pointed a browser at it hoping for a file API. What I found:

| Method | Path | What it does |
|---|---|---|
| GET | `/files` | JSON list of the inbox. `{name, size}`, and size is a display string like `"14.86 MB"`, not bytes. |
| GET | `/files/<name>` | Download. |
| POST | `/files` | Upload. The multipart field is called `newfile`. |
| POST | `/files/<name>` | Delete, if the body says `_method=delete`. Not a real DELETE. |
| GET | `/progress/<name>` | Progress while an upload is running. |

No rename. No folders. `/dirs`, `/books`, and `/documents` all 404. The list is one flat inbox, `Documents/Trans/WiFi Transfer/`, and the page only runs while that screen is open on the reader. It also throws APKs away.

Android has a perfectly good file-sharing API. Hanvon didn't expose it. The page is a drop box for "I have a book, put it on the reader," which is the job they think you have.

Wi-Fi FTP was the workaround, via [Material Files](https://github.com/zhanghai/MaterialFiles), sideloaded because there's no Play Store. It's slow in a way that threads don't fix. One stream moved 51 MB in 104 seconds, about 0.5 MB/s. Four streams were slower per file, not faster. The Mac was handing over 256 KB at a time and the socket accepted it. The reader drains that at about 4 Mbit/s. Split the pipe across six manga volumes and each one crawls, and then the connections die. The radio is the ceiling.

## The shelf stores paths, not files

This is the part that lost books.

The shelf doesn't read the folder. It stores a path. Move the file and the old entry survives, pointing nowhere. Removing a shelf entry has a separate option to also delete the file, and I hit that option. The folder emptied.

Nothing watches the directory. An FTP upload writes the file and stops. The shelf only learns about it when you import by hand, and I couldn't find a rescan. The databases under `hwsys` are bookmarks and recent reading, not the catalog.

The Wi-Fi page makes this worse. Its JavaScript fetches `/files` once and keeps the list. Rename the books into category folders and the old screen still shows the old names. I cleared 57 of those by tapping. The sorted files still didn't appear, because clearing a record isn't the same as writing one, and an FTP upload never writes one.

The loop that works is boring. Put the file straight into its category folder, then import that folder. Don't upload through the Wi-Fi page. Don't rename after the fact.

On the Xteink the card is the library. Unplug it, move files, plug it back in, the reader scans. The Clear 7 split that into two things, the file and a shelf entry that points at the file. The shelf is a nice feature if you're buying books inside Hanvon's apps. For files you already own it's a second database, with no sync, and a delete button that can erase the book.

## Getting to adb

By this point I wanted `adb push`, which writes straight to `/sdcard` over the cable. No MTP, no Wi-Fi. It needs USB debugging, and USB debugging lives in developer options, and Hanvon doesn't link to developer options.

The usual trick is About, tap the build number seven times. I tapped. Nothing happened. I was in Hanvon's settings, not Android's. On this firmware the build number you can see from their menu is a label, not a button.

The way in is an intent. Android will open `com.android.settings` if something asks it to, even when the launcher has no icon for it. So I built a one-activity APK, about 12 KB, whose only job is to fire `android.settings.SETTINGS` and exit. The first build targeted Android 14 and wasn't zip-aligned, and the reader refused it. The second targeted the version I thought it was running. That one installed. One tap and the real Settings opened. Genuinely delightful, after two days of this.

The seven taps were still in the wrong place. On this Android, Build number isn't on the About page. It's one level down, under Android version. And if you tap Android version repeatedly you get the easter egg, not the next page. One tap opens the page. Seven taps on the build number under that, and it told me I was a developer.

USB debugging is on that page, labeled USB 调试. Plug in, allow the prompt, and `adb devices` shows the reader. It was running Android 14, not 11, which is why the first Settings APK had been refused.

Twenty manga volumes took 63 seconds. About 35 MB/s. Wi-Fi had been 0.5. The cable had been capable of that the whole time. I just couldn't reach the switch.

## The same door, from the other side

adb isn't a product feature. Almost nobody who buys one of these will turn on USB debugging. What Hanvon expects is the path I'd already been through: open Wi-Fi transfer, drop a file in the inbox, tap import. On Windows they have a desktop app. WeChat and Baidu Netdisk cover the people who never plug in a cable. That's enough for one book. It isn't enough for 1,400 books in folders, and they didn't build that, because the shelf is the thing they're selling.

The adb route only exists because Android requires it for developers and Hanvon didn't bother to strip it out.

I found a Reddit post from someone with a Clear 7 Turbo who'd hit the same wall. He got there with an F-Droid app called System Settings, which launches the activity Hanvon removed from the launcher, same trick as my APK. He turned on USB debugging. Then he hit a different wall: the device rejects any second home app, including one installed over adb, with "cannot install home app." The bookstore tab isn't a separate app. It lives inside `hvLauncher`, which is also the navigation bar, so removing it removes the home screen. His unit powers off the moment a Mac claims the USB interface. Mine enumerates and stays up. Same lock, different cable luck.

[Readest](https://github.com/readest/readest), which is what he wanted for sync, opens to a blank screen. It needs Play Services, and this firmware doesn't have them.

So the settings app is hidden, not gone. A different home screen is actually locked. I didn't try to replace the launcher after reading that, and I don't think it would have worked.

## Keeping the stock reader

Once the files were on it I went looking for the feature that justified the weekend, and I talked myself out of the screen too quickly.

The Xteink is slow because the panel is slow. A page turn takes long enough to see, and the ghost of the last page sits there until a full refresh. The 锦鲤's oxide backplane flips the pixels faster, so the next page is just there. That's a big gap, not a small one, and no firmware on the Xteink can code its way past the panel.

The rest of the spec sheet is less convincing. Against my old Kindle Oasis (2019) the 锦鲤 is slimmer and not lighter, 198 g to 188 g. The battery is 4000 mAh against 1130 mAh, and Hanvon quotes 22 days of standby, which is worse than an Oasis manages on a three-year-old charge. You pay the extra capacity back to the operating system: Android 14, an 8-core chip, 4 GB of RAM, and a shelf app.

I'd also misremembered the buttons. This model is touch only. One touch key on the bezel, tap to go back, hold to force a full refresh. Page turns are screen taps.

[KOReader](https://github.com/koreader/koreader) does install, and it reads the folder directly, which is the thing I wanted the whole time. The cost is the fast refresh and Hanvon's Chinese typesetting. The oxide boost and the partial-refresh tuning live in their reader. KOReader drives the panel through Android, so you go back to full refreshes or a generic partial mode. You also lose the pen, the ink notes, and the dictionary and translation lookup. KOReader's annotations are typed highlights, and its typesetting is excellent for English if you configure it yourself.

I kept the stock reader. The page turns are why the device is worth using.

The setup I landed on: [Calibre](https://github.com/kovidgoyal/calibre) on the Mac is the archive, tagged `shelf:<category>` so the folders survive a move. `adb push` delivers the file. Then I import the folder on the shelf, because it still won't notice on its own. KOReader pulling from the Calibre content server is nicer, but only if I stop reading in Hanvon's app.

You can also hide the phone leftovers. Contacts, a dialer, an FM radio, a calculator. `pm uninstall --user 0` removes them for the current user, and a reboot can quietly put Hanvon's own apps back, because nothing was deleted from the system partition. A factory reset brings all of them back. I restored the AI chat on purpose after removing it by accident.

## What I actually wanted

The thing I wanted, and nobody sells, is [CrossPoint](https://github.com/crosspoint-reader/crosspoint-reader) running on a panel this fast. The best software in this corner of eink still targets an ESP32. The best panel still runs a shelf that doesn't watch its own folders.

BOOX and Bigme are closer, in that developer options are where they should be and you can install KOReader like a normal app. They still don't give you the card. The Clear 7 is a third thing: the system is all there, and the doors are unlabeled.

For now that's enough. Books go in through adb. I import the folder. I read.
