#include <ArduinoModbus.h>

// Schneider iEM3000 series Modbus emulator for Arduino Uno
// Register addresses match iEM5000 documentation (doc address = Modbus address - 1)
// All measurement values are IEEE 754 float32, stored as 2 x 16-bit registers (big-endian word order)

const int REG_START = 2999; // first register address (doc address 3000)
const int REG_COUNT = 100;  // covers up to address 3110 (frequency)

// Write a float32 value to two consecutive holding registers (big-endian word order)
void writeFloat(int address, float value) {
  union {
    float f;
    uint16_t regs[2];
  } u;
  u.f = value;
  ModbusRTUServer.holdingRegisterWrite(address,     u.regs[1]); // high word
  ModbusRTUServer.holdingRegisterWrite(address + 1, u.regs[0]); // low word
}

// Simulation parameters
const float VOLTAGE_NOM   = 230.0;  // V (phase-neutral nominal)
const float POWER_FACTOR  = 0.92;   // cos(phi)
const float CURRENT_BASE[3] = {18.5, 17.8, 19.1}; // A per phase

// Returns a small random noise value within +/- amplitude
float noise(float amplitude) {
  return ((float)random(-1000, 1000) / 1000.0) * amplitude;
}

void setup() {
  Serial.begin(9600);
  ModbusRTUServer.begin(1, 9600); // slave ID 1, 9600 baud, 8N1
  ModbusRTUServer.configureHoldingRegisters(REG_START, REG_COUNT);
}

void loop() {
  // Phase voltages (phase-neutral) with small variation
  float v1 = VOLTAGE_NOM + noise(1.5);
  float v2 = VOLTAGE_NOM + noise(1.5);
  float v3 = VOLTAGE_NOM + noise(1.5);

  // Phase currents with small variation
  float i1 = CURRENT_BASE[0] + noise(0.3);
  float i2 = CURRENT_BASE[1] + noise(0.3);
  float i3 = CURRENT_BASE[2] + noise(0.3);

  // Active power per phase: P = V x I x cos(phi)
  float p1   = v1 * i1 * POWER_FACTOR;
  float p2   = v2 * i2 * POWER_FACTOR;
  float p3   = v3 * i3 * POWER_FACTOR;
  float pTot = p1 + p2 + p3;

  // Reactive power per phase: Q = V x I x sin(phi)
  float sinPhi = sqrt(1.0 - POWER_FACTOR * POWER_FACTOR);
  float q1   = v1 * i1 * sinPhi;
  float q2   = v2 * i2 * sinPhi;
  float q3   = v3 * i3 * sinPhi;
  float qTot = q1 + q2 + q3;

  // Apparent power per phase: S = V x I
  float s1   = v1 * i1;
  float s2   = v2 * i2;
  float s3   = v3 * i3;
  float sTot = s1 + s2 + s3;

  // Phase currents (doc 3000, 3002, 3004)
  writeFloat(2999, i1);
  writeFloat(3001, i2);
  writeFloat(3003, i3);

  // Line-to-line voltages V12, V23, V31 (doc 3020, 3022, 3024)
  writeFloat(3019, v1 * 1.732);
  writeFloat(3021, v2 * 1.732);
  writeFloat(3023, v3 * 1.732);

  // Phase-neutral voltages V1N, V2N, V3N (doc 3028, 3030, 3032)
  writeFloat(3027, v1);
  writeFloat(3029, v2);
  writeFloat(3031, v3);

  // Active power per phase + total (doc 3054, 3056, 3058, 3060)
  writeFloat(3053, p1);
  writeFloat(3055, p2);
  writeFloat(3057, p3);
  writeFloat(3059, pTot);

  // Reactive power per phase + total (doc 3062, 3064, 3066, 3068)
  writeFloat(3061, q1);
  writeFloat(3063, q2);
  writeFloat(3065, q3);
  writeFloat(3067, qTot);

  // Apparent power per phase + total (doc 3070, 3072, 3074, 3076)
  writeFloat(3069, s1);
  writeFloat(3071, s2);
  writeFloat(3073, s3);
  writeFloat(3075, sTot);

  // Power factor per phase + total (doc 3078, 3080, 3082, 3084)
  writeFloat(3077, POWER_FACTOR + noise(0.005));
  writeFloat(3079, POWER_FACTOR + noise(0.005));
  writeFloat(3081, POWER_FACTOR + noise(0.005));
  writeFloat(3083, POWER_FACTOR);

  ModbusRTUServer.poll();
  delay(500);
}