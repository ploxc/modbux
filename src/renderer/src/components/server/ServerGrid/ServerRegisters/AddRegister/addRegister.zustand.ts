/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { MaskSetFn } from '@renderer/context/client.zustand.types'
import { useServerZustand } from '@renderer/context/server.zustand'
import { asOneServerUnitStep } from '@renderer/context/serverUndo'
import { BaseDataType, DataType, NumberRegisters, registerWidth, ServerRegister } from '@shared'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import {
  addressValidation,
  FIELD_DEFAULTS,
  RegisterFormSnapshot,
  toFormSnapshot,
  toRegisterParams,
  utf8MaxBytes,
  utf8RegisterLength
} from './addRegister.zustand.helpers'

// ─── Address validation ──────────────────────────────────────────────────────

/**
 * What the dialog's address rule needs of the two stores, read where it runs.
 *
 * `addressValidation` takes the used addresses and the register being edited
 * as arguments, so this is the one place either is looked up.
 */
const validateAddress = (
  address: string,
  dataType: DataType,
  registerType: NumberRegisters | undefined,
  registerLength: string
): ReturnType<typeof addressValidation> => {
  const serverZustand = useServerZustand.getState()
  const uuid = serverZustand.selectedUuid
  const unitId = serverZustand.getUnitId(uuid)

  return addressValidation({
    address,
    dataType,
    registerType,
    registerLength,
    usedAddresses: registerType
      ? (serverZustand.servers[uuid]?.usedAddresses[unitId]?.[registerType] ?? [])
      : [],
    editRegister: useAddRegisterZustand.getState().serverRegisterEdit?.params
  })
}

// ─── Store types ─────────────────────────────────────────────────────────────

interface AddRegisterZustand {
  serverRegisterEdit: ServerRegister[number] | undefined
  registerType: NumberRegisters | undefined
  setRegisterType: (registerType: NumberRegisters | undefined) => void
  setEditRegister: (register: ServerRegister[number] | undefined) => void
  /** What the fields held once the edit dialog had filled them. */
  pristine: RegisterFormSnapshot | undefined
  capturePristine: () => void
  valid: {
    address: boolean
    value: boolean
    min: boolean
    max: boolean
    interval: boolean
    registerLength: boolean
    stringValue: boolean
  }
  address: string
  addressInUse: boolean
  addressFitError: boolean
  setAddress: MaskSetFn
  dataType: BaseDataType
  setDataType: (dataType: BaseDataType) => void
  value: string
  setValue: MaskSetFn
  interval: string
  setInterval: MaskSetFn
  comment: string
  setComment: MaskSetFn
  min: string
  setMin: MaskSetFn
  max: string
  setMax: MaskSetFn
  fixed: boolean
  setFixed: (fixed: boolean) => void
  stringValue: string
  setStringValue: (stringValue: string) => void
  registerLength: string
  setRegisterLength: MaskSetFn
  showDatePickerUtc: boolean
  setShowDatePickerUtc: (utc: boolean) => void
  initNextUnusedAddress: (startFrom?: number) => void
  resetToDefaults: () => void
  /**
   * Writes what the dialog holds to the server, and answers where it landed.
   *
   * Undefined when nothing was written: no register type, or a payload main
   * refused. Everything the buttons do afterwards reads the store this wrote,
   * so they wait on it.
   */
  submit: (isEdit: boolean) => Promise<{ address: number; dataType: BaseDataType } | undefined>
  /**
   * Removes the register the dialog was opened on, and nothing outside edit
   * mode.
   */
  remove: () => void
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useAddRegisterZustand = create<AddRegisterZustand, [['zustand/mutative', never]]>(
  mutative((set, getState) => ({
    serverRegisterEdit: undefined,
    registerType: undefined,

    setRegisterType: (registerType) =>
      set((state) => {
        state.registerType = registerType
      }),

    setEditRegister: (register) =>
      set((state) => {
        state.serverRegisterEdit = register
        // The fields still hold the previous register, so there is nothing to
        // compare against until the edit effect has filled them again.
        state.pristine = undefined
      }),

    pristine: undefined,

    capturePristine: () =>
      set((state) => {
        state.pristine = toFormSnapshot(getState())
      }),

    valid: {
      address: true,
      value: true,
      min: true,
      max: true,
      interval: true,
      registerLength: true,
      stringValue: true
    },

    address: '0',
    addressInUse: false,
    addressFitError: false,

    setAddress: (address, valid) =>
      set((state) => {
        state.address = address
        const { registerType, dataType, registerLength } = getState()
        const result = validateAddress(address, dataType, registerType, registerLength)
        state.addressInUse = result.addressInUse
        state.addressFitError = result.addressFitError
        state.valid.address = !!valid && result.addressValid
      }),

    dataType: 'int16',

    setDataType: (dataType) =>
      set((state) => {
        state.dataType = dataType

        if (dataType === 'utf8' || dataType === 'bitmap') state.fixed = true
        if (['unix', 'datetime'].includes(dataType)) {
          state.value = String(Date.now())
          state.valid.value = true
        }

        const { registerType, address, registerLength } = getState()
        const result = validateAddress(address, dataType, registerType, registerLength)
        state.addressInUse = result.addressInUse
        state.addressFitError = result.addressFitError
        state.valid.address = result.addressValid
        state.valid.registerLength = result.registerLengthValid
      }),

    value: FIELD_DEFAULTS.value,
    setValue: (value, valid) =>
      set((state) => {
        state.value = value
        state.valid.value = !!valid
      }),

    interval: FIELD_DEFAULTS.interval,
    setInterval: (interval, valid) =>
      set((state) => {
        state.interval = interval
        state.valid.interval = !!valid
      }),

    comment: '',
    setComment: (comment) =>
      set((state) => {
        state.comment = comment
      }),

    min: FIELD_DEFAULTS.min,
    setMin: (min, valid) =>
      set((state) => {
        state.min = min
        state.valid.min = !!valid
      }),

    max: FIELD_DEFAULTS.max,
    setMax: (max, valid) =>
      set((state) => {
        state.max = max
        state.valid.max = !!valid
      }),

    fixed: true,
    setFixed: (fixed) =>
      set((state) => {
        state.fixed = fixed
      }),

    stringValue: '',
    setStringValue: (value) => {
      const { registerLength } = getState()
      const maxBytes = utf8MaxBytes(registerLength)
      const valid = new TextEncoder().encode(value).length <= maxBytes
      set((state) => {
        state.stringValue = value
        state.valid.stringValue = valid
      })
    },

    registerLength: FIELD_DEFAULTS.registerLength,
    setRegisterLength: (registerLength, valid) =>
      set((state) => {
        state.registerLength = registerLength
        const { registerType, dataType, address } = getState()
        if (!registerType || dataType !== 'utf8') return
        const result = validateAddress(address, dataType, registerType, registerLength)
        state.addressInUse = result.addressInUse
        state.addressFitError = result.addressFitError
        state.valid.address = result.addressValid
        state.valid.registerLength = !!valid && result.registerLengthValid
      }),

    showDatePickerUtc: false,
    setShowDatePickerUtc: (utc) =>
      set((state) => {
        state.showDatePickerUtc = utc
      }),

    initNextUnusedAddress: (startFrom?: number) =>
      set((state) => {
        const { registerType, dataType, registerLength } = getState()
        if (!registerType) return

        const serverZustand = useServerZustand.getState()
        const uuid = serverZustand.selectedUuid
        const unitId = serverZustand.getUnitId(uuid)
        const usedAddresses =
          serverZustand.servers[uuid]?.usedAddresses[unitId]?.[registerType] ?? []
        const size = registerWidth(
          dataType,
          dataType === 'utf8' ? utf8RegisterLength(registerLength) : undefined
        )

        let found = false
        for (let address = startFrom ?? 0; address <= 65535 - (size - 1); address++) {
          const needed = Array.from({ length: size }, (_, i) => address + i)
          if (needed.every((a) => !usedAddresses.includes(a))) {
            state.address = String(address)
            state.addressInUse = false
            state.addressFitError = false
            state.valid.address = true
            found = true
            break
          }
        }

        // Nothing free from `startFrom` on, so the field keeps the address it
        // has, which after an Add & Next is the one just written. Writing only
        // inside the loop left that address unmarked with Add still live, and
        // the next press replaced the register and lost its comment.
        if (!found) {
          const result = validateAddress(state.address, dataType, registerType, registerLength)
          state.addressInUse = result.addressInUse
          state.addressFitError = result.addressFitError
          state.valid.address = result.addressValid
        }
      }),

    /**
     * The store owns this rather than the buttons, because it is a state
     * mutation: it reads the whole form and writes through the server store.
     * The translation itself is pure and lives in the helpers, where its unit
     * conversions are tested.
     */
    submit: async (isEdit) => {
      const form = getState()
      const { registerType, serverRegisterEdit } = form
      if (!registerType) return undefined

      const serverZustand = useServerZustand.getState()
      const uuid = serverZustand.selectedUuid
      const unitId = serverZustand.getUnitId(uuid)

      const params = toRegisterParams({
        fixed: form.fixed,
        address: form.address,
        value: form.value,
        dataType: form.dataType,
        registerType,
        min: form.min,
        max: form.max,
        interval: form.interval,
        comment: form.comment,
        stringValue: form.stringValue,
        registerLength: form.registerLength
      })

      // Moving an existing register means the old address has to go first: the
      // two spans can overlap, and `removeRegister` erases everything the old
      // one occupied, so removing after the write would erase part of it.
      const moved =
        isEdit && serverRegisterEdit && serverRegisterEdit.params.address !== params.address
          ? serverRegisterEdit.params
          : undefined

      let added = false
      // A move is a remove and an add, and one step to undo.
      await asOneServerUnitStep(uuid, unitId, async () => {
        if (moved) {
          serverZustand.removeRegister({
            uuid,
            unitId,
            address: moved.address,
            registerType,
            dataType: moved.dataType,
            length: moved.length
          })
        }

        added = await serverZustand.addRegister({ uuid, unitId, params })
        // The remove has already happened, so a refusal here would leave the
        // user with neither register and a message about only one of them.
        // What goes back is what main handed over in the first place, so the
        // restore is refused only if the schema changed under a running app.
        if (!added && moved) await serverZustand.addRegister({ uuid, unitId, params: moved })
      })
      if (!added) return undefined

      return { address: params.address, dataType: form.dataType }
    },

    /**
     * Beside `submit`, and for the same reason: it reads the dialog and writes
     * through the server store.
     *
     * What it removes is the register the dialog was opened on, which the
     * address field does not answer. That field is editable, and a changed one
     * means the user is moving the register rather than naming another.
     */
    remove: () => {
      const { serverRegisterEdit } = getState()
      if (!serverRegisterEdit) return

      const serverZustand = useServerZustand.getState()
      const uuid = serverZustand.selectedUuid
      const { address, registerType, dataType, length } = serverRegisterEdit.params

      serverZustand.removeRegister({
        uuid,
        unitId: serverZustand.getUnitId(uuid),
        address,
        registerType,
        dataType,
        length
      })
    },

    resetToDefaults: () =>
      set((state) => {
        state.address = '0'
        state.dataType = 'int16'
        state.value = FIELD_DEFAULTS.value
        state.min = FIELD_DEFAULTS.min
        state.max = FIELD_DEFAULTS.max
        state.interval = FIELD_DEFAULTS.interval
        state.comment = ''
        state.fixed = true
        state.stringValue = ''
        state.registerLength = FIELD_DEFAULTS.registerLength
        state.serverRegisterEdit = undefined
        state.pristine = undefined
        state.addressInUse = false
        state.addressFitError = false
        state.valid = {
          address: true,
          value: true,
          min: true,
          max: true,
          interval: true,
          registerLength: true,
          stringValue: true
        }
      })
  }))
)
