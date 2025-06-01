import { Typography, Table, TableBody, TableCell, TableHead, TableRow, Paper } from '@mui/material'

const EndianTable = () => {
  return (
    <Paper sx={{ px: 3, py: 2, maxHeight: '66dvh', overflow: 'auto', minWidth: '80dvw' }}>
      <Typography variant="h6">Big-Endian vs Little-Endian Word Order</Typography>
      <Typography variant="body1" sx={{ mb: 2 }}>
        The following table shows an example of a 32-bit integer value (<strong>305419896</strong>,
        hexadecimal <strong>0x12345678</strong>) and how it is split into 16-bit words in both
        Big-Endian and Little-Endian formats. We also show how these words are assigned to Modbus
        registers, along with SCL (Structured Control Language) assignments.
      </Typography>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>
              <strong>Order Type</strong>
            </TableCell>
            <TableCell>
              <strong>Register 0</strong>
            </TableCell>
            <TableCell>
              <strong>Register 1</strong>
            </TableCell>
            <TableCell>
              <strong>SCL Register Assignments</strong>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>Big-Endian</TableCell>
            <TableCell>
              <strong>0x1234</strong> (W1)
            </TableCell>
            <TableCell>
              <strong>0x5678</strong> (W0)
            </TableCell>
            <TableCell>registers[0] := W1; registers[1] := W0;</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Little-Endian</TableCell>
            <TableCell>
              <strong>0x5678</strong> (W0)
            </TableCell>
            <TableCell>
              <strong>0x1234</strong> (W1)
            </TableCell>
            <TableCell>registers[0] := W0; registers[1] := W1;</TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <Typography variant="body1" sx={{ mt: 2 }}>
        <strong>Big-Endian (BE):</strong> In Big-Endian format, the most significant byte (MSB) is
        stored first, followed by the least significant byte (LSB). In Modbus, this is the standard
        for most systems, including PLCs like Siemens S7. In the example, the 32-bit integer{' '}
        <strong>0x12345678</strong> is stored as:
      </Typography>

      <Typography variant="body2" sx={{ ml: 2, mt: 1 }}>
        - Word order: <strong>W1 = 0x1234</strong>, <strong>W0 = 0x5678</strong>
        <br />- SCL assignment: `registers[0] := W1`, `registers[1] := W0`
      </Typography>

      <Typography variant="body1" sx={{ mt: 2 }}>
        <strong>Little-Endian (LE):</strong> In Little-Endian format, the least significant byte
        (LSB) is stored first, followed by the most significant byte (MSB). This format is less
        common in Modbus communication. In the same example, the 32-bit integer{' '}
        <strong>0x12345678</strong> is stored as:
      </Typography>

      <Typography variant="body2" sx={{ ml: 2, mt: 1 }}>
        - Word order: <strong>W1 = 0x5678</strong>, <strong>W0 = 0x1234</strong>
        <br />- SCL assignment: `registers[0] := W0`, `registers[1] := W1`
      </Typography>

      <Typography variant="body1" sx={{ mt: 2 }}>
        <strong>Explanation:</strong>
        <ul>
          <li>
            In <strong>Big-Endian</strong>, the high-order word (<strong>W1</strong>) is assigned to
            the first register, while the low-order word (<strong>W0</strong>) is assigned to the
            second register.
          </li>
          <li>
            In <strong>Little-Endian</strong>, the low-order word (<strong>W0</strong>) is stored
            first, and the high-order word (<strong>W1</strong>) is stored second.
          </li>
        </ul>
        When communicating with Modbus devices, it's essential to know which endianness the device
        uses to ensure correct data interpretation.
      </Typography>
    </Paper>
  )
}

export default EndianTable
