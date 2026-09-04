# Read the library, not its README

Two of this project's sharper findings came from opening
`node_modules/modbus-serial/` instead of trusting a name or a doc page. Both
would have been invisible to any amount of reading in `src/`.

## A method that lies in its name

`connectTcpRTUBuffered(host, opts)` sends **Modbus TCP with MBAP framing**, not
RTU over TCP. Its port strips the CRC and prepends an MBAP header:

```sh
grep -n "MBAP\|crc\|write" node_modules/modbus-serial/ports/tcprtubufferedport.js
```

Real encapsulated RTU is `connectTelnet`, whose port writes the raw RTU frame
with its CRC unchanged:

```sh
grep -n "write" node_modules/modbus-serial/ports/telnetport.js
```

Modbux uses `connectTelnet` for `ModbusRtuOverTcp` in `modbusClient.ts connect`.

The consequence reaches the tests. RTU over TCP cannot be validated against
Modbux's own `ServerTCP`, because that server speaks MBAP: a correct
`connectTelnet` client times out against it, and that timeout is the right
answer rather than a defect. A green happy-path e2e for that transport is not
available without a real gateway.

## An error that does not travel

`ServerSerial` builds two objects:

```
_serverPath = new SerialPort(options)
_server     = _serverPath.pipe(ServerSerialPipeHandler)
```

`.pipe()` forwards data and not errors, so an open failure on `_serverPath` —
port not found, permission denied — never reaches `_server`. Listening only on
the object the code hands you produces an unhandled rejection instead of a
message the user can read.

```sh
grep -n "pipe\|on('error'\|emit(" node_modules/modbus-serial/servers/serverserial.js
```

## The rule

For anything in `modbus`, `boundary` or `shared`, an assumption about
modbus-serial is a finding unless you opened the file that implements it. The
name is not evidence. The README is not evidence. The source in `node_modules`
is.
