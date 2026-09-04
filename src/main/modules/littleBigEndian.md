A table showing the association between Modbus registers and the SCL variables `W1` (most significant word) and `W0` (least significant word) in both Big-Endian and Little-Endian order. We use the same `int32` value of **305419896** (hexadecimal **0x12345678**).

### Big-Endian vs Little-Endian Table with SCL Register Assignment:

`0x12345678`

| **Order Type**    | **Word register 0** | **Word register 1** | **SCL Registers**                          |
| ----------------- | ------------------- | ------------------- | ------------------------------------------ |
| **Big-Endian**    | `0x1234` (W1)       | `0x5678` (W0)       | `registers[0] := W1`, `registers[1] := W0` |
| **Little-Endian** | `0x5678` (W0)       | `0x1234` (W1)       | `registers[0] := W0`, `registers[1] := W1` |

### Explanation:

- **Big-Endian (BE)**:

  - **Bytes** are stored as `12 34 56 78`, with the most significant bytes coming first.
  - In terms of words:
    - `W1` (most significant word) = `0x1234`.
    - `W0` (least significant word) = `0x5678`.
  - The SCL code to store this in registers is:
    ```scl
    registers[0] := dintDWord.W1;  // Most significant word (MSW)
    registers[1] := dintDWord.W0;  // Least significant word (LSW)
    ```

- **Little-Endian (LE)**:
  - **Bytes** are stored as `78 56 34 12`, with the least significant bytes coming first.
  - In terms of words:
    - `W1` (most significant word) = `0x5678`.
    - `W0` (least significant word) = `0x1234`.
  - The SCL code to store this, with reversed word order, is:
    ```scl
    registers[0] := dintDWord.W0;  // Least significant word (LSW)
    registers[1] := dintDWord.W1;  // Most significant word (MSW)
    ```

### Additional Information:

- **Big-Endian**: This is the standard order in Modbus and PLCs like Siemens S7, where `W1` comes first and `W0` follows.
- **Little-Endian**: Here, you need to reverse the word order, which is uncommon in Modbus communication but might occur in some systems.

This table helps clarify how to split 32-bit values into 16-bit words and how they are assigned to registers based on the endianness.
