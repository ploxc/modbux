# Changelog

All notable changes to Modbux will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Undo and redo.** Cmd+Z or Ctrl+Z undoes the last change to the view you
  are on, and Cmd+Shift+Z, Ctrl+Shift+Z or Ctrl+Y redoes it. On the client that
  is the connection and register settings and the mapping, with a Load or a
  Clear Config as one step. On the server it is the registers and coils you
  add, edit, remove or switch, a server's name, port and byte order, and a
  server you create, delete, clear or open. An undo shows you what it changes,
  and the server's steps go with the server view into its own window and back.
  A connection setting waits until you disconnect, and Modbux says so, as it
  does when there is nothing left to undo. In a text field the keys undo your
  typing. Each view keeps its last 100 steps until Modbux closes.

### Changed

- **A poll backs off from a device that stops answering.** After three polls
  in a row that a device lets time out, Modbux waits twice as long before
  each next one, up to a minute, and polls at your rate again as soon as it
  answers. On a serial bus every poll of a device that is not there held up
  the others for a full timeout. A device that answers with an exception is
  answering, unless it is a gateway saying the device behind it did not.
- **Switching read configuration reads nothing by itself.** Turning it on
  shows the mapping, and Read or the poll fills in the values. A read the
  switch started could land after you switched back, and filled the grid
  with the other view's rows.
- **Scans no longer pause between requests.** A register scan and a unit ID
  scan waited 10 ms after every request, so a device that answers quickly was
  asked at a fraction of its pace. A register scan of 10,000 addresses in
  chunks of 10 took 13 seconds against Modbux's own server and now takes about
  two. A slow device scans as fast as before, and the progress bar still moves.

### Fixed

- **Clearing the Unit ID field no longer sets unit 0.** An empty field was
  taken as 0, so the next read or poll went to unit 0, which on RTU is the
  broadcast address. The client now keeps the unit ID it had until you type
  another.
- **A register scan stops at the end of its range.** Its last request read a
  whole chunk, so a scan of 0 to 10 at a chunk of 125 read 0 through 124 and
  showed addresses you did not ask for.
- **Editing a register's comment keeps what a client wrote into it.** Saving
  the edit dialog with only the comment changed wrote the register's value, or
  a UTF-8 register's text, back over whatever a client had written since.
- **Editing a bit comment keeps the register's value.** On a bitmap register
  of the server, a comment edit put back the value the register was made
  with, over whatever a client had written since.
- **Opening the server in its own window leaves the RTU server running.** The
  new window started the RTU server again, which closed and reopened its serial
  port and said "RTU server stopped". The window now asks which servers are
  running instead of starting them.
- **A unit id over RTU stops at 247.** Modbus RTU and RTU over TCP address
  units up to 247, and Modbus TCP keeps 0 to 255. A client over RTU on 248 or
  higher keeps its id, shows it red, and refuses to connect, read, poll, write
  or scan until you change it. A unit id scan over RTU ends at 247.

- **Stopping and starting the poll during a read sends one read at a time.**
  Pressing Poll off and on again while a read was on its way put a second read
  on the connection before the first had answered, which an RTU bus cannot
  tell apart. Every request now waits for the one before it.
- **A connection that drops keeps its poll while it reconnects.** The poll
  that ticked during a reconnect put the client view on Connect, and the
  reconnect then put it back on connected and started the poll again. The
  view now says it is reconnecting for as long as it is, and the poll waits it
  out and reads again once the connection is back. A TCP connection the device
  resets is reconnected too, the moment it resets, where the client used to go
  to Connect at the next read, and a connection error that leaves the port
  working no longer shows the client as disconnected.
- **A stopped poll stops after the request it has on the way.** Its read went
  on through every configured group and then filled the grid, so a scan
  started from a poll waited for all of it, against a device that does not
  answer one timeout per group. It now lets go once the request on the wire
  answers, and what it read is dropped.
- **Exception 11 no longer tells you to retry later.** A gateway or a server
  answering exception 11 read "retry request again later", while the Modbus
  specification says the target device is usually not there, and Modbux's own
  server sends it for a unit ID it does not host. The message now says so.
- **A unit ID scan stops at the last address.** Address 65535 with a length of
  2 asked every unit for an address that does not exist. The Length field now
  stops at the addresses left, as the read's Length field does. A write that
  would run past the last address is refused too.
- **A unit ID scan of many IDs keeps up.** The results table drew itself
  again for every unit ID, and a scan of 255 IDs lagged behind. It now draws
  the new results ten times a second.
- **Opening the other side's configuration says so.** A client configuration
  from before files carried a version, opened on the server, cleared the
  server and loaded nothing, while it reported "Configuration updated from
  older format". The other mix-ups were refused with a message naming a
  missing field. Each now says the file belongs to the other side, and leaves
  what is on screen alone.
- **A server configuration from before units opens again.** A file saved
  before a server had units, before June 2025, loaded as an empty server. Its
  registers now open as unit 0.
- **A client keeps reconnecting while its device is gone.** Pulling the USB
  cable of a serial device got one reconnect attempt, and when that failed the
  client stopped trying, so plugging the cable back in did nothing. It now
  keeps trying, up to five attempts, and picks the connection and the poll back
  up once the device answers.
- **A connection that keeps dropping is reconnected up to five times in a
  row.** Modbux counted the reconnects 1/5 to 5/5 and gave up at 5/5 without
  making the fifth.
- **A scan no longer stalls the window on a large configuration.** Every step a
  scan reported, every transaction it logged and every change of connection
  state wrote your whole saved client configuration back to disk, register
  mapping and all. With a large mapping that is close to a millisecond of
  frozen window each time, and a unit ID scan reports a step for every unit ID
  and register type it asks. None of it is worth keeping
  across a launch, and none of it is written any more.
- **A register a saved session cannot read no longer resets every server.** One
  register Modbux refused reset the whole server setup to its defaults: every
  server, with its name, port and registers. It now costs the registers of the
  one server holding it, and every other server comes back as it was.
- **A blank COM port is no longer sent to the serial connection.** Clearing the
  COM field wrote an empty port name into the connection, so a connect attempt
  failed on nothing to open. The field keeps what you type and marks it, and
  Connect stays greyed until it names a port again, as it does for a blank
  host.
- **Read and Poll grey out while the Length field is empty or 0.** They took
  a press there: the read went out at the length the field last accepted, and
  after a restart at a length of 0, which asks the device for no registers.
  A read or a poll of no registers is refused with a message now as well.
  With read configuration on, the length counts only for a register type
  with nothing configured, because that is when the toolbar's range is read.
- **A disconnect from a TCP device that never closes its side drops the
  connection.** Within three seconds of the last request, as while polling,
  Modbux said "Disconnected from server" and left the connection half open
  for as long as the device kept it. It now waits the five seconds a
  disconnect is given, drops it and says the disconnect timed out, as it
  already did for one that came later.
- **Changing the unit ID now empties the grid the way the address does.** The
  rows the previous unit answered stayed on screen under a unit ID that had not
  read them, so you were looking at one device's values under another's ID. The
  address, the length and the register type already cleared it. A running poll
  fills the grid on its own and is left alone, as before. A read already on the
  line when you change it no longer fills the grid back in either: its answer
  says nothing about which unit ID, address or register type it was sent for,
  so Modbux drops it rather than draw it under the new one.
- **A server configuration that puts one register at two addresses is now
  refused.** A register is stored under its address and names that address
  again in its own settings, and a file whose two disagreed opened: the server
  answered at one address and the grid drew the other, so a generator's values
  never reached the row and Delete took the register out of the server and left
  the row behind. A file like that is refused by name now, and a register like
  that in a saved session is dropped rather than opened.
- **A second write no longer goes out while the first is still on the line.**
  Modbux sends one request at a time, and a poll, a scan or a read already
  running refused a second. A write did not: two bit toggles a click apart in
  the client's bitmap panel put two requests on one connection, and the second
  carried the word from before the first. A write now holds the connection until
  the register has been read back, the bits stop taking a click for that moment,
  and the Read and Poll buttons and the Read Configuration toggle grey out with
  them.
- **A coil read can now ask for the 2000 bits the protocol allows.** The Length
  field stopped at 125 whatever the type selected, which is the ceiling for
  holding and input registers, so reading a thousand coils took eight reads
  rather than one. It now stops at what the selected type answers, and at what
  is left from the address: a read starting at 65500 offers 36. Writing those
  coils back stops at 1968, which is what one request carries. A read of the
  toolbar's range no longer runs off the end of the range either, and a read or
  a scan no longer asks for more than one response carries: a length or chunk
  size left over from a coil read asked a device for 2000 registers.
- **A scan that reaches past the last unit ID or register now stops there.** A
  Start of 200 with a Count of 100 asked for unit ID 299, and an address of
  60000 with a Length of 10000 asked for register 69999. Neither exists, so the
  scan was refused before it began: the results you had were cleared, the grid
  was emptied, and nothing said why. Both scans now run up to the last one there
  is. Clearing the Count, Length or Chunk Size field left a zero behind, which
  scanned nothing in the same silence, and now goes back to 1 when you leave the
  field.
- **The transaction log now shows the address of a coil read and of a write.**
  The Addr column was blank for every coil read, every discrete input read,
  every coil write and every multi-register write, so a log of coil traffic said nothing about which
  address each request went to.
- **The unit ID scan no longer asks for more than a device can answer.** Its
  Length field took anything up to 65535 and sent it as the quantity, which is
  past what the protocol allows. Every device on the bus then refused the
  request or said nothing, so what the scan told you was about the request
  rather than about the device. The field now stops at 125 registers, or 2000
  bits when only bit types are selected.
- **A 64-bit server register now shows the value a master wrote.** A master
  writing an INT64, UINT64 or DATETIME register sends four words, and the server
  folded them through a number that carries 53 bits, so anything above that came
  back rounded. Writing one more word to that register afterwards collapsed it
  to the last word alone. A DATETIME at the far end of the range read back one
  millisecond late for the same reason.
- **A configuration from a newer Modbux is now checked before it is loaded.** It
  was the one file that went in unread: the fields were taken as they came, so a
  register map a newer version writes differently was written straight into the
  app. The warning said some features may not work correctly. The file is now
  read against what this version understands, what matches is kept, and the
  message says which parts did not come across.
- **An old configuration that is not shaped like one is now refused instead of
  half opened.** A v1 server config whose unit held a number or a piece of text,
  or whose coils or discrete inputs key held one instead of the addresses under
  it, opened with those parts silently empty and reported that it had been
  updated from an older format. A file whose whole register section was a piece
  of text opened as two empty units. Each of those is refused by name now, the
  way every other unreadable file already is.
- **A file that is not a configuration is now refused instead of opened.**
  Picking a JSON file holding a number, a string or a list emptied the server
  and reported that the configuration had been updated from an older format. A
  file holding only `null` emptied it too and then failed with a message
  about a property of null. A file claiming a version that is not a number got
  one of those or the newer-version warning, depending on the value.
- **Opening the wrong file no longer empties the server.** Picking a client
  config, or any file Modbux cannot read as a server config, cleared the setup
  that was on screen before anything had read the file, and then reported the
  failure. The file is read first now, and a refused one costs nothing.
- **The server view no longer comes up blank and stays that way.** One thing main
  refused while the setup was being handed over left the whole view faded out,
  on that launch and on every launch after it, with no message and nothing on
  screen to clear the configuration with. A refusal now costs the one server it
  belonged to.
- **A server register the encoder cannot serve is now refused by name.** A
  config file could put a fixed value outside the range of its own data type, a
  string wider than the register map, or a register running past the last
  address, and opening it left the server view blank for that launch and every
  launch after it, with no message and nothing on screen to clear it with. A
  generator drawing between two numbers its data type cannot hold served 0
  instead, and one whose interval was too long fired every millisecond. The
  file is now refused with the register and the field named, and one already
  saved is dropped on the next launch, with the addresses it stood on freed and
  the rest of the setup kept.
- **Splitting the server into its own window no longer turns Read
  Configuration off.** The toggle stayed on while the reading went back to the
  address and length in the toolbar, so every configured register outside them
  stopped being read and its value left the grid. The split out window now
  leaves the client alone.
- **A DATETIME write now carries the date you typed.** The write dialog took a
  value field whose range was stated in seconds while the register is encoded
  from milliseconds, so every value it accepted fell before the year 2000 and
  went out as 2000/01/01 00:00:00. The field now takes milliseconds over the
  range the format carries, which is 2000 through 2127.
- **A write no longer logs another request as its own.** The transaction log
  took the last request that went out, listed it as the write and took its entry
  away, so a read still waiting for an answer timed out. That happened to a
  write with a poll or a read running alongside it.
- **The transaction log now shows a unit id scan.** The scan sends a request per
  unit id and per register type, and the log listed none of them.
- **Two bit toggles in a row now both land.** A bit in the server's bitmap panel
  is set by writing the whole word back, and the panel read that word from
  before the toggle before it, so a second toggle in quick succession cleared
  the bit the first had set. A double click on one bit left it on.
- **A register added in the split out server window now survives a restart.**
  Each window kept its own copy of the server setup and both wrote it to the
  same place, so the window you were not looking at wrote its copy over what you
  had just added. One generator was enough to keep that happening, and closing
  the split window left the stale copy as the only one. A server made there can
  be changed once the window closes.
- **The RTU status light is right in a window that just opened.** It is set from
  a message the server sends when it starts or stops, so a window opened after
  that showed the server as stopped while it was running. The window now asks.
- **A config file Modbux refuses now says which register and which field.** One
  malformed register was reported as `serverRegistersPerUnit.1: Invalid input`,
  naming neither the address nor what was wrong with it, and a unit id outside
  0 to 255 produced a message that listed all 256 of them.
- **A UTF-8 value no longer shows two characters from the register after it.**
  The string ran to the end of the group of addresses it was read in, one
  register past the last one that group holds.
- **Writing a value as UTF-8 no longer writes a zero.** The write dialog lists
  UTF-8 with the number types and has no field for the characters, so the write
  went out as one register of 0 over whatever the address held. Modbux now says
  it cannot write the value as UTF-8 and sends nothing.
- **The date picker now writes the date it shows.** Opening a stored UNIX or
  DATETIME register to edit it put the current time in the field instead of the
  date the register holds, so changing the comment or the address wrote today
  over it. Add & Next left the picker showing the current time over a field it
  had cleared, so the next Add wrote 1970/01/01 for a UNIX register and
  2000/01/01 for a DATETIME.
- **The bottom of the register list is reachable with a bitmap row open.** The
  client grid reserved the same height for every row, so the bit panel that
  opens below a bitmap register pushed everything after it down by a height the
  grid did not know about, and the last rows ended below the furthest it would
  scroll. The row now takes the height the panel needs, at any window width.
- **Add & Next no longer replaces the register it just added.** With no free
  address left above the one you added, the dialog stayed on that address
  without marking it, and Add was still live: pressing it wrote over the
  register you had just made and lost its comment. The address is now marked In
  use and Add goes off.
- **The date picker no longer takes a date the register cannot carry.** A
  DATETIME runs out at the end of 2127 and a UNIX timestamp on 2106/02/07, and
  the picker took any year it could show: a UNIX register set to 2200 read back
  as 2063/11/24. Such a date is now marked wrong, and Add stays off until you
  pick one the register holds.
- **A timestamp row now shows only a date the registers really hold.** The
  server's DATETIME row decoded the four registers itself, without the format's
  invalid flag and without checking the fields it read, so whatever a client had
  written into them came back as a plausible date. A day its month does not
  have, such as the 31st of February, came out in the client grid as the words
  `Invalid DateTime`. It now shows nothing there and a dash in the server row,
  and a UNIX register holding 0 shows 1970/01/01 00:00:00 where it used to show
  a dash.
- **The server no longer answers for units it does not have.** On a shared
  RS-485 line it replied to every address on the bus, including the ones
  belonging to the real devices on it, so its frame went out at the same moment
  theirs did. It now says nothing at all for an address it does not host, which
  is the only answer that leaves the line alone. Over TCP, where saying nothing
  is just a timeout, it replies that the unit is not there. A unit is one you
  gave registers to, and the ID picker still lists all 256.
- **A write to a unit you never configured no longer creates one.** Any client
  on the network could turn an unused unit ID into one the server answers for,
  and nothing in the view said it had happened.
- **Opening the server in its own window no longer disconnects your clients.**
  The second window restarted every running TCP server, and anything connected was
  dropped without a word. Clearing a server's registers did the same. Both now
  leave the connection where it is.
- **Writing one coil no longer switches off the ones beside it.** The write
  dialog started every coil at off, and a write of multiple coils sends every
  coil from the one you opened to the end of the range, so everything you had
  not touched went out as off. The dialog now opens showing what the last read
  returned, which is what goes back to the device.
- **The server window now tells you what went wrong in it.** With the server in
  its own window, every message from the backend went to the main window
  instead, which is the one on the client view. A port the server refused, a
  port already taken, an RTU port that disconnected: the field snapped back and
  nothing was said where you were looking. Each message now goes to the window
  it is about.
- **An empty value field no longer writes a zero.** The box turned red and the
  write went out anyway, as a 0, because an empty field is what JavaScript reads
  as zero. The write buttons are now off until the field holds a number, and the
  field is no longer left marked as wrong after you close the dialog.
- **The write dialog no longer keeps the data type of the address you opened
  before.** A register your configuration gives no type kept whatever the last
  one used, so a value could go out encoded as something the address is not.
  Such an address now opens as INT16.
- **Resetting server registers while a client writes to them no longer breaks
  the view.** Values arrive in batches, so one could land just after you deleted
  a register or reset the type, and that threw where nothing could catch it.
  Such a value is now dropped, and the address you deleted stays deleted.
- **A write no longer times out a read that was already on its way.** Logging a
  transaction threw away the bookkeeping for every request still waiting for an
  answer, so a read overlapping a write reported a timeout that never happened
  and the grid kept its old values.
- **A disconnect that hangs no longer costs you auto-reconnect.** When closing
  the connection took too long, the client was replaced by a fresh one that
  nobody was listening to, so for the rest of the session a dropped connection
  went unreported and was never reconnected. The client it replaced went the
  other way: Modbux kept listening to it, and on a serial port it kept the port
  open, so its own close could arrive later as a connection lost on the
  connection that had taken its place. Modbux now stops listening to it. On a
  serial port it also says that the port may stay open until you close Modbux,
  which is what a "Cannot lock port" on the next connect means.
- **The transaction log no longer marks a good read as failed.** Reading a
  configuration reads one group of addresses at a time, and once one group
  failed, every group after it was logged carrying that group's error.
- **A server that fails to start says so.** The port was reported back to the
  view before the server had actually taken it, so a port claimed in the
  meantime left you with a server that looked up and answered nothing. Modbux
  now waits for the answer, moves to the next free port, and keeps a server on
  its old port when a port change cannot be completed.
- **On Linux the offer to unblock port 502 now reaches the split window too.**
  It was asked only by the main window, and splitting puts the server in a
  window of its own, so anyone who worked that way was left on port 1024 with no
  explanation.
- **Unplugging the serial adapter now stops the RTU server in the view.** The
  server stayed marked as running on a port that was gone, so the only sign was
  that nothing answered it any more.
- **Remove in the edit dialog no longer answers for an address you only typed.**
  Changing the address and then pressing Remove left the register you opened
  where it was, deleted whatever sat at the address you had typed, and closed
  the dialog as though it had worked. The two buttons now follow what the
  dialog holds: Remove until you change something, Submit Change once you have.
- **Switching a register between Fixed and Generator no longer leaves the other
  side blank.** A fixed register carries no range and a generator carries no
  value, so the fields you switched to came up empty and marked wrong, and
  Submit Change stayed off until you typed both of them. They now start where a
  new register starts. Opening the dialog also no longer flashes the labels red
  for a moment.
- **A register at an address outside the map no longer loads.** A configuration
  file edited by hand could put one past 65535, where no Modbus request can
  reach it and Remove could not clear it, because the add path was the one that
  left the range unchecked. Such a file is now refused and names the register,
  and a saved setup that already carried one comes back without it, with
  everything else kept.
- **Loading a configuration no longer rewrites your own words.** Four register
  type names were renamed everywhere they appeared in the file, so a
  configuration called "Coils bank A" came back as "coils bank A" and a comment
  reading "read InputRegisters here" came back as "read input_registers here".
  Saving after that made it permanent. The rename now applies to the keys it was
  written for, and only to a configuration old enough to need it.
- **On macOS, opening Modbux again while it sits in the Dock with no window now
  brings the window back.** It used to answer with a red "A JavaScript error
  occurred in the main process" dialog and no window at all. Your client stays
  connected and polling the whole time, and the server keeps the connections it
  has, which was already true and is now covered by a test.
- **A saved configuration keeps the coils you added and left off.** A unit
  whose only content was coils or discrete inputs, none of them switched on,
  was written to the file as nothing at all, and opening that file gave you an
  empty unit back. The bits you place are configuration whether they are on or
  off, and they are saved and loaded as such.
- **A comma typed into a number field no longer resets those settings at the
  next start.** The unit ID, port, address and length fields read a comma as a
  decimal separator, and a value carrying one was stored as no number at all.
  The next start could not read it back and put the connection or the register
  settings back to their defaults. Those fields hold whole numbers now, so the
  comma never lands, and what your client sends and what the field shows can no
  longer drift apart.
- **A scan ends when the connection does.** Losing the connection partway
  through left the scan walking the rest of the address range against a client
  that was gone, raising an error for every chunk it tried, and the scan dialog
  would not close while that ran. The scan now stops at the read that failed.
- **Starting the poll again right after stopping it no longer runs two read
  loops at once.** Pressing Stop and then Poll while a read was still on its way
  left the old loop running beside the new one, so the device was asked twice as
  often from then on. Only one loop runs now,
  however fast the buttons are pressed.
- **Read configuration is only offered where there is something to read.** The
  button went live as soon as an address carried anything at all, a comment
  included. On coils and discrete inputs a comment is the only thing you can
  add, so labelling one was enough to switch the button on, and pressing it
  emptied the grid and disabled the address and length fields until you pressed
  it again. It now counts the addresses you gave a data type, which is what it
  reads.
- **A scan of coils or discrete inputs now shows every one it read.** The scan
  asks for the chunk size the dialog is set to, and the grid was filled with the
  read length from the toolbar instead, so the default chunk of 100 against a
  read length of 10 kept ten coils out of every hundred it found. Every address
  in the chunk now arrives.
- **The RTU server now opens at the data bits and stop bits you set.** Both were
  handed to the serial library in a place it does not read, so every serial
  server opened at 8 data bits and 1 stop bit whatever the panel showed. Baud
  rate and parity always arrived, and the client was never affected.
- **Nothing else goes out in the middle of a read.** Modbux waited for a poll
  and for both scans before it read or wrote, and not for a read of its own, so
  anything asked for while a long read was still on the wire put a second
  request on the line. Measured over RTU with two reads: the registers the first
  one was fetching came back empty. Read is now off for as long as a read runs,
  and a write asked for in that moment is refused with a message rather than
  sent.
- **Cancelling a connect to a serial port now cancels it.** The Connect button
  turns into a Cancel while the port is opening. Pressing it used to change
  nothing: a moment later the app reported "Connected over Modbus RTU" and sat
  there holding the port. The cancelled connect now closes the port it opened
  and says nothing. Pressing Connect again before it has let that port go says
  so rather than opening a second one. Over TCP the cancel always worked.
- **Read configuration now reads.** Turning it on while connected showed your
  configured registers with a value of 0 in every one of them until you pressed
  Read, and a 0 you have not read looks exactly like a 0 the device holds. The
  values are now there as soon as the rows are. Disconnected it still shows the
  mapping alone, and it asks for nothing while a poll or a scan is running.
- **A server that gets no port now says so instead of showing one it never
  bound.** A server whose port is taken moves up to the next free one and the
  port field follows it. When the search ran out the field filled in anyway,
  with a port nothing was listening on. A server configured on 65535 with that
  port taken was worse: the search stepped to 65536, which is not a port, and
  the server came up neither working nor reporting anything. Both now report
  that no port was available and leave the field alone. A server that was
  already running keeps the port it had, rather than losing the one it was on to
  a search that found nothing.
- **The update notice no longer opens GitHub in a Modbux window.** The split out
  server window showed the same notice as the main one, and its Download latest
  release link opened the release page in a second Modbux window rather than in
  the browser. The notice is the main window's alone now, and a link from either
  window opens in the browser.
- **A Linear Interpolation endpoint no longer loses its decimals.** Its four
  fields stopped at two, so an endpoint of 0.0625 went in as 0.06 and every row
  scaled through it was off by 4%. They take seven now, which is what the
  value, min and max fields on the server side take.
- **A read no longer fails on a device whose answer carries half a register.**
  The reply declares how many bytes it holds, and a device declaring an odd
  number leaves a byte no register is made of. Modbux read past the end of it
  and the read stopped with `Attempt to access memory outside buffer bounds`
  rather than showing the registers that did come through. The trailing byte is
  dropped now.
- **Deleting a server now releases its registers.** The button freed the value
  generators and the listener and left every register of every unit ID behind,
  so a session that added and deleted servers kept growing. It also said "No
  server found" for a server that was never started, which is a server you can
  delete like any other.
- **A serial error Modbux does not recognise now names the port it came from.**
  The port was in front of the two messages Modbux writes itself and missing
  from the one that hands the driver's own text through, which is the message a
  bug report gets written about.
- **A port another server already holds now says so.** Typing it into a second
  server's Port field put the old number back with nothing said, which reads
  like the field ignored you. The message names the port.
- **Clear Config asks before it throws the mapping away.** One click on the
  button beside Save dropped the data type, scaling factor, comment, group end
  and bitmap of every mapped register, and the configuration name with them,
  with nothing to undo it. It now says how many registers carry something, and
  that read configuration goes off with them, and waits for an answer. With
  nothing mapped and no name there is nothing to lose, and it still clears at
  once.
- **A client configuration that cannot be read no longer costs you the Load
  button.** A file that is moved or deleted between picking it and opening it
  left the button greyed out and the file picker gone, until you walked out to
  Home and back. It says what went wrong and takes the next file, and a file it
  refuses no longer empties the grid either. Opening a server configuration was
  already like this.
- **The Value column no longer shows the word "undefined".** Rows read as coils
  or discrete inputs carry no register value, and they stay on screen when you
  switch the register type while a read loop is running. Every address
  mapped as a date or a Unix time then drew `undefined` in the Value column, and
  a UTF-8 mapping drew `undefine`.
  Those cells are empty now.
- **The address on the Add bar follows the unit you are looking at.** It was
  read once, from whichever unit was selected then, so after switching to a unit
  holding fewer coils it sat above every address that unit had. Adding an
  address with nothing free above it now says so as well, instead of leaving the
  button doing nothing.

### Changed

- **Unit 0 is the broadcast address on RTU.** A request to 0 goes to every
  device on the bus at once and none of them replies, so registers you put on
  unit 0 cannot be read back over serial. A write to 0 still lands, on every
  unit the server hosts, and nothing goes back on the line. Modbux says so once
  while the RTU server is running and unit 0 holds registers. Over TCP there is
  no broadcast and unit 0 stays an ordinary address.
- **The parity list offers none, even and odd.** Mark and space were in it, and
  on macOS and Linux picking either one failed the connection outright, because
  the serial layer Modbux uses has no setting for them on those platforms. A
  saved configuration that carries one now comes back on none, with the com port
  and baud rate beside it kept.
- **Modbux follows your system's setting to reduce motion.** With it on, a
  button no longer ripples when you click it, dialogs, menus and tooltips appear
  at once, and a busy spinner stands still.

## [2.3.0] - 2026-08-30

### Added

- **Linux: Modbux offers to unblock port 502 for you.** Linux keeps the low
  ports for root. The Modbus default sits in that range, so the server started
  somewhere else and clients looking for 502 found nothing. Modbux now reads
  the kernel setting when the server view opens and says what is in the way. It
  offers to run the one sysctl that lowers the floor, until reboot or for good.
  You see the command before it runs, and the elevation goes through PolicyKit,
  so you approve it yourself and Modbux never sees your password. Inside
  Flatpak or Snap it hands you the command instead.
- **Linux: Modbux says why a serial port refuses to open.** A serial port
  belongs to the `dialout` group, and a user outside it cannot open one. The
  port is still listed, so nothing looks wrong until the connection fails on a
  permission error. Selecting RTU now checks, says so, and offers to add you,
  with the command shown before it runs. It checks again when the port list is
  refreshed, so plugging an adapter in later is caught too. The group name is
  read off the device that refuses rather than assumed, so a distribution that
  calls it something other than `dialout` gets the right answer. Membership
  arrives at the next login, so it offers to log you out as well. Mint and
  Ubuntu put the first user in that group at install time, so most people never
  meet this.
- **A button that clears the filters you set.** It sits next to RAW in the
  client toolbar and shows up only while a filter is on, so a filter left behind
  no longer reads as missing data.
- **The grid fills while a register scan runs.** It used to disappear for the
  length of the scan, leaving a progress bar and no sign of what was coming in.
  It stays up now and the rows arrive as the scan walks the range. They are
  written in batches, so the grid costs nothing: the same scan took eight times
  longer with the grid up before this, and the window stopped answering while
  it ran. You can scroll and page through it while it fills, but not edit it:
  the rows are still arriving, and the toolbar and the transaction log step
  aside for the same reason. Starting a scan turns advanced mode on, since a
  scan walks raw addresses, and the dialog stays open when the scan ends rather
  than closing to reveal what you were already watching. The eye beside the
  scan button puts it all back the old way.
- **A scan says how many registers it found.** The grid shows the first rows,
  not the total, so the count sits beside the scan button.

### Changed

- **A unit that refuses is no longer painted as a unit that is not there.** In
  the unit ID scan, a Modbus exception is a reply: the unit exists and it
  answered the question with no. It used to get the same red as a unit that
  stayed silent. The result cells now say OK, EXCEPTION or NO REPLY, in green,
  amber and red, and the message beside them carries the same colour. Filtering
  a column offers those three answers rather than a text box.
- **Only the columns worth filtering still offer a filter.** Addr., Bit and BIN
  lost theirs: a filter over an address or a row of LEDs answers nothing anyone
  asks. HEX and the value columns keep theirs, because a status word or a fault
  code from the manual is often exactly what you are hunting for.
- **Reading a configuration turns filtering off.** That mode already hides the
  rows without a data type, and a filter of your own could fight it or take it
  away from the column menu, leaving the list full of empty rows.
- **Switching between BE and LE reads again.** The rows on screen were read in
  the other word order and stayed that way until you read yourself, so a 32-bit
  value kept showing the number it had before the switch. Modbux reads again
  when there is something to reinterpret, unless polling or a scan is about to
  anyway.
- **A scan dialog no longer closes when you click beside it.** Reaching for
  anything behind it threw away the scan you were setting up. It has a close
  button now, off while a scan runs, and Escape still works.

### Fixed

- **Disconnecting no longer reports an error.** Clicking Disconnect raised
  "Connection closed unexpectedly" next to "Disconnected from server". The close
  event comes back while the disconnect is still finishing, and the flag marking
  it as deliberate was set too late to be read. That same stale flag then
  suppressed the next close that really was unexpected. Both are fixed, over
  serial and over TCP.
- **A reply that arrives in two pieces is no longer read as an error.** A Modbus
  TCP response does not always land in one packet, and the half that had come in
  was parsed as if it were the whole. Gateways on a slow or busy link are where
  this shows.
- **The coils and discrete inputs lists scroll inside their own panel.** A long
  list used to grow past the server view, and the whole view scrolled
  underneath it instead.
- **A scan no longer stops on the log it writes.** Scanning over a serial port
  could end partway with nothing on screen to say why. Modbux keeps a copy of
  every request and reply for the transaction log, and a request that had no
  copy took the scan down with it. That case now logs an empty frame.
- **The scan timeout keeps what you type.** Clearing the field and typing 500
  left 10000 behind. A value outside 100 to 10000 is corrected when you leave
  the field instead of while you are still typing.
- **The server port can no longer be set to 0.** Typing 0 left the view saying
  "Port 0" while the server was answering on 502. Zero is not a port, it is a
  request for whichever one is free. A port is between 1 and 65535, and asking
  for anything else leaves the server where it is.

### Security

- **The Linux AppImage is built by a version that fixes GHSA-7g7r-gx96-252g.**
  The advisory is about search path elements inside the AppImage that
  electron-builder produces, so it travels in the artefact rather than staying
  on the build machine.

## [2.2.1] - 2026-08-07

### Fixed

- **You can see which transport you are connected over.** RTU over TCP reuses
  the TCP host and port and keeps the TCP button selected, so nothing told the
  two apart. Now the connect message names it, and the TCP button and the
  checkbox in the cog menu both turn orange while it is on.
- **The register grid no longer sorts.** A 32-bit value keeps its second half
  in the next register, so reordering the rows pulled the halves apart and every
  value on screen became wrong. Filtering is unaffected.

### Changed

- **The download is less than half the size** — 170 MB → 82 MB on Windows,
  225 MB → 108 MB on macOS. The installer was carrying the entire build
  toolchain plus a second, unused copy of Electron.

## [2.2.0] - 2026-08-06

### Added

- **RTU over TCP client mode** — connect to serial-to-Ethernet gateways that carry
  encapsulated RTU (a full RTU frame with CRC sent over a TCP socket)
  - Enabled via a checkbox in the ⚙ options menu, shown only when TCP is selected
  - Reuses the TCP host/port inputs and the unit ID field

## [2.1.0] - 2026-03-14

### Added

- **RTU server mode** — new TCP/RTU toggle lets the server expose registers over a serial port
  - COM port autocomplete with refresh, baud rate, parity, data bits, and stop bits
  - Status indicator with click-to-reconnect
  - Switching between TCP and RTU preserves all register data
  - All register types, value generators, and booleans work the same as TCP

- **Hostname/IP support for TCP client** — connection config now accepts any hostname or IP address instead of only `localhost`

- **Linux support** — verified builds and packaging for Linux (`.deb`, `.AppImage`)
  - Privileged port errors (EACCES on port 502) handled gracefully with clear error messages
  - Linux icon path configured for correct app icons
  - README updated with Linux-specific setup notes (unprivileged ports, serial `dialout` group)

---

## [2.0.0] - 2026-02-24

### Added

- **Bitmap data type** for both client and server registers
  - Client: expandable detail panel showing all 16 bits with toggle indicators, inline comments, per-bit color (default/warning/error), and invert option
  - Server: per-bit toggle circles that update the underlying uint16 register value
  - Bitmap configuration persists in config files via `registerMapping`

- **Redesigned server booleans** (coils & discrete inputs)
  - Individual address rows with toggle circles and inline editable comments
  - Inline add bar with auto-increment to the next free address
  - Per-boolean delete with hover-to-reveal trash icon and red row highlight

- **Three new server register data types:**
  - **UTF-8 strings:** Store text values across multiple registers (1-124 registers) with real-time byte counter
  - **Unix timestamps:** Store and display timestamps as seconds since epoch
  - **Datetime (IEC 870-5):** Industry-standard datetime format for SCADA systems

- **Time-based value generators** for Unix and Datetime types
  - Registers automatically update to current system time at configured intervals

- **DateTimePicker with UTC toggle** for setting Unix/datetime values in fixed mode
  - UTC toggle only changes the display — the register value is always encoded in UTC

- **`Read configuration` improvements**
  - Group index column ("G") showing which read group each register belongs to with alternating background tints
  - Read errors displayed inline as styled error rows instead of snackbar notifications

- **Endianness included in client config export/import** — `littleEndian` now persists in client config JSON files

### Changed

- **Endianness is now a global server setting** instead of per-register configuration
  - Endian toggle moved from "Add Register" modal to server toolbar

- **Config files now include version metadata** for backward compatibility
  - Server configs: `version`, `modbuxVersion`, `littleEndian` fields
  - Client configs: `version`, `modbuxVersion` fields
  - Old configurations are **automatically migrated** when loaded

- **`Read configuration` replaces `View Configuration` button** — the separate `View Configuration` button is removed; its functionality is merged into the `Read configuration` toggle

- **Scan dialogs use address + length** instead of min/max range inputs, with a shared address base toggle component

- **Address base simplified** — the conventional address column (40001/30001 style) is removed; the 0/1 toggle now shifts displayed addresses by +1 while the underlying register address stays the same

- **Backward compatibility handling**
  - Automatic migration of v1 configs to v2 format
  - Detection and handling of mixed endianness scenarios (shows warning)
  - Forward compatibility: configs from newer versions show warning but attempt to load
  - localStorage state is automatically migrated on app startup

### Fixed

- **Off-by-one in server register arrays** — address 65535 now works correctly (arrays are 65536 elements instead of 65535)
- **Register not removed from mapping when set to "none"** — `Read configuration` toggle now correctly disables when no registers are configured
- **UTF-8 value column offset** — string values after non-ASCII registers now display correctly
- **Client polling resumes on reconnect** — polling continues automatically after connection drops
- **Windows e2e compatibility** — splash window now has a distinct title for reliable main window detection

### Migration Notes

- **Automatic migration:** Old configs (pre-v2.0.0) are auto-migrated when loaded
- **Mixed endianness warning:** If a v1 config had registers with different byte orders, the most common setting is used globally with a warning notification
- **Backward incompatibility:** Configs saved in v2.0.0+ cannot be opened in older Modbux versions
  - This is intentional to enable the improved architecture
  - Keep backups of configs if you need to downgrade
- **`datetime` register length corrected** from 2 to 4 registers (IEC 870-5 standard)

---

## [1.4.2] - 2026-02-20

### Fixed

- Multi-register data types (int32/float/int64/double) not fully cleared on removal — all occupied registers are now reset, not just the start address

---

## [1.4.1] - 2025-01-15

### Fixed

- Windows build and E2E test compatibility
- Critical coil/discrete input bug
- AddRegister UX improvements

### Added

- Update notification banner
- Comprehensive E2E tests

---

_For older versions, see git history_
