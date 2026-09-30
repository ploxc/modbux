import Box from '@mui/material/Box'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useConnectionZustand } from '@renderer/context/connection.zustand'
import { ConnectionSettings, ConnectionSettingsSchema } from '@shared'
import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useState } from 'react'
import SettingsSection, { SettingsCard, SettingsRow } from './SettingsSection'

type NumberSetting = Exclude<keyof ConnectionSettings, 'reconnectWhileLogging'>

interface NumberFieldProps {
  setting: NumberSetting
  title: string
  description: string
  unit: string
  /** What one unit of the field is in the stored value: 1000 for seconds of a value in milliseconds. */
  scale?: number
  width: number
}

/**
 * One number, taken on blur or Enter when the schema takes it, and put back
 * otherwise, an emptied field included.
 */
const NumberField = meme(
  ({ setting, title, description, unit, scale = 1, width }: NumberFieldProps): JSX.Element => {
    const stored = useConnectionZustand((z) => z[setting])
    const [draft, setDraft] = useState(String(stored / scale))
    useEffect(() => setDraft(String(stored / scale)), [stored, scale])

    const commit = useCallback(() => {
      // An emptied field is no value, though `Number('')` answers 0.
      const value = draft.trim() === '' ? Number.NaN : Number(draft) * scale
      const connectionZustand = useConnectionZustand.getState()
      if (!ConnectionSettingsSchema.shape[setting].safeParse(value).success) {
        setDraft(String(connectionZustand[setting] / scale))
        return
      }
      if (value !== connectionZustand[setting])
        connectionZustand.setConnectionSetting(setting, value)
    }, [draft, scale, setting])
    const handleChange = useCallback(
      (event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
      []
    )
    const handleKeyDown = useCallback(
      (event: KeyboardEvent) => {
        if (event.key === 'Enter') commit()
      },
      [commit]
    )

    return (
      <SettingsRow
        title={title}
        description={description}
        control={
          <TextField
            size="small"
            value={draft}
            onChange={handleChange}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            sx={{ width }}
            slotProps={{
              htmlInput: {
                'data-testid': `connection-${setting}-input`,
                'aria-label': title,
                inputMode: 'numeric',
                style: { fontFamily: 'monospace' }
              },
              input: {
                endAdornment: (
                  <Box component="span" sx={{ fontSize: 12, color: '#a3a3a3', pl: 0.5 }}>
                    {unit}
                  </Box>
                )
              }
            }}
          />
        }
      />
    )
  }
)

/** Keep reconnecting while a client riding the connection logs. */
const WhileLoggingSwitch = meme((): JSX.Element => {
  const checked = useConnectionZustand((z) => z.reconnectWhileLogging)
  const handleChange = useCallback((_event: ChangeEvent<HTMLInputElement>, value: boolean) => {
    const connectionZustand = useConnectionZustand.getState()
    connectionZustand.setConnectionSetting('reconnectWhileLogging', value)
  }, [])
  return (
    <SettingsRow
      title="While logging"
      description="Keep trying for as long as logging is on, whatever Attempts says. The log shows the gap."
      control={
        <Switch
          checked={checked}
          onChange={handleChange}
          slotProps={{ input: { 'aria-label': 'Keep reconnecting while logging' } }}
          data-testid="connection-while-logging-switch"
        />
      }
    />
  )
})

const GROUP_SX = { fontSize: 12, fontWeight: 500, color: '#a3a3a3', px: 0.25 } as const

/**
 * How every client meets a dropped connection and a unit that does not
 * answer: the reconnect attempts, their waits and logging's say over them,
 * and when a unit counts as offline and how far apart its polls get.
 */
const ConnectionSettingsSection = meme((): JSX.Element => {
  const attempts = useConnectionZustand((z) => z.reconnectAttempts)
  const firstWait = useConnectionZustand((z) => z.reconnectFirstWait)
  const longestWait = useConnectionZustand((z) => z.reconnectLongestWait)
  const summary = `${attempts === 0 ? 'Keeps reconnecting' : `${attempts} reconnects`}, ${firstWait / 1000} s to ${longestWait / 1000} s`

  return (
    <SettingsSection
      title="Connection"
      summary={
        <Box component="span" sx={{ fontSize: 13, color: '#a3a3a3' }}>
          {summary}
        </Box>
      }
      testId="settings-connection-section"
    >
      <Box component="span" sx={GROUP_SX}>
        Reconnect after a dropped connection
      </Box>
      <SettingsCard>
        <NumberField
          setting="reconnectAttempts"
          title="Attempts"
          description="Before Modbux gives up and disconnects. 0 keeps trying."
          unit=""
          width={72}
        />
        <NumberField
          setting="reconnectFirstWait"
          title="First wait"
          description="Before the first attempt. Each attempt after waits twice as long."
          unit="s"
          scale={1000}
          width={80}
        />
        <NumberField
          setting="reconnectLongestWait"
          title="Longest wait"
          description="The wait stops growing here."
          unit="s"
          scale={1000}
          width={80}
        />
        <WhileLoggingSwitch />
      </SettingsCard>
      <Box component="span" sx={GROUP_SX}>
        A unit that does not answer
      </Box>
      <SettingsCard>
        <NumberField
          setting="offlineAfterTimeouts"
          title="Offline after"
          description="Polls in a row a unit may leave unanswered before it counts as offline."
          unit="polls"
          width={104}
        />
        <NumberField
          setting="maxPollInterval"
          title="Longest poll interval"
          description="An offline unit is polled less often, up to this, so it costs the others less."
          unit="s"
          scale={1000}
          width={80}
        />
      </SettingsCard>
    </SettingsSection>
  )
})

export default ConnectionSettingsSection
