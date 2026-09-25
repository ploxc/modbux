import { createServer } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Page } from '@playwright/test'
import { test, expect, resetApp } from '../../fixtures/electron-app'
import { readFileSync } from 'node:fs'
import { resolve } from 'path'
import { cleanServerState, loadServerConfig, navigateToHome } from '../../fixtures/helpers'

const SERVER_CONFIG = resolve(__dirname, '../../fixtures/config-files/server-integration.json')
const CLIENT_CONFIG = resolve(__dirname, '../../fixtures/config-files/client-basic.json')

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

/** A port nothing listens on, so a Modbux already running on 7502 is not in the way. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => resolve(port))
    })
  })

/** The token the page shows once, read out of the command it offers. */
const shownToken = async (p: Page): Promise<string> => {
  const command = (await p.getByTestId('mcp-connect-command').textContent()) ?? ''
  const token = /Bearer (mbx_[\w-]+)/.exec(command)?.[1]
  if (!token) throw new Error(`no token in the command the page shows: ${command}`)
  return token
}

/** The text a tool answered, parsed, or its error as thrown. */
const call = async (
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
): Promise<unknown> => {
  const answer = await client.callTool({ name, arguments: args })
  const [first] = answer.content as { type: string; text: string }[]
  if (answer.isError) throw new Error(first?.text)
  return JSON.parse(first?.text ?? 'null')
}

// An assistant reaches Modbux over MCP: the settings page lets it in, and each
// tool is answered by the window showing the store it reads.
test.describe.serial('The MCP connector', () => {
  let port: number
  let token: string
  let assistant: Client | undefined

  const connect = async (): Promise<Client> => {
    const client = new Client({ name: 'e2e', version: '1.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } }
      })
    )
    return client
  }

  test.afterAll(async () => {
    await assistant?.close()
  })

  test('the server on 502 holds registers to read', async ({ mainPage }) => {
    await cleanServerState(mainPage)
    await loadServerConfig(mainPage, SERVER_CONFIG)
  })

  test('the settings open from home, with the connector off', async ({ mainPage }) => {
    await navigateToHome(mainPage)
    await mainPage.getByTestId('home-settings-btn').click()
    await expect(mainPage.getByTestId('mcp-status')).toContainText('Off')
    await expect(mainPage.getByTestId('mcp-enabled-switch').locator('input')).not.toBeChecked()
    await expect(mainPage.getByTestId('mcp-operate-checkbox').locator('input')).toBeDisabled()
  })

  test('a port and the switch leave it off while there is no token', async ({ mainPage }) => {
    port = await freePort()
    const portInput = mainPage.getByTestId('mcp-port-input')
    await portInput.fill(String(port))
    await portInput.press('Enter')
    await mainPage.getByTestId('mcp-enabled-switch').click()
    await expect(mainPage.getByTestId('mcp-operate-checkbox').locator('input')).toBeEnabled()
    await expect(mainPage.getByTestId('mcp-status')).toContainText('Off')
  })

  test('a token turns it on and is shown once with the command', async ({ mainPage }) => {
    await mainPage.getByTestId('mcp-create-token-btn').click()
    await expect(mainPage.getByTestId('mcp-status')).toHaveText(
      `Listening on http://127.0.0.1:${port}/mcp`
    )
    token = await shownToken(mainPage)
    await expect(mainPage.getByTestId('mcp-connect-command')).toContainText(`127.0.0.1:${port}/mcp`)
    await expect(mainPage.getByTestId('mcp-copy-token-btn')).toBeVisible()
  })

  test('an assistant with the token sees the read tools', async () => {
    assistant = await connect()
    const { tools } = await assistant.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'get_client',
      'get_scan',
      'get_unit',
      'list_clients',
      'list_registers',
      'list_servers',
      'read_values'
    ])
  })

  test('list_clients is answered by the window, from its store', async () => {
    if (!assistant) throw new Error('no assistant connected')
    const clients = (await call(assistant, 'list_clients')) as {
      id: string
      connectState: string
    }[]
    expect(clients.length).toBeGreaterThan(0)
    expect(clients[0]?.connectState).toBe('disconnected')
  })

  test('list_servers names the server on 502', async () => {
    if (!assistant) throw new Error('no assistant connected')
    const servers = (await call(assistant, 'list_servers')) as { target: string }[]
    expect(servers.map((server) => server.target)).toContain('port 502')
  })

  test('a client id nobody has is answered with what to do', async () => {
    if (!assistant) throw new Error('no assistant connected')
    await expect(call(assistant, 'get_client', { client: 'nobody' })).rejects.toThrow(
      'list_clients'
    )
  })

  test('the operate box adds the operate tools', async ({ mainPage }) => {
    await mainPage.getByTestId('mcp-operate-checkbox').click()
    await expect(mainPage.getByTestId('mcp-operate-checkbox').locator('input')).toBeChecked()
    await assistant?.close()
    assistant = await connect()
    const { tools } = await assistant.listTools()
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'set_client_config',
        'connect',
        'disconnect',
        'read',
        'start_polling',
        'stop_polling',
        'scan_unit_ids',
        'scan_registers',
        'stop_scan'
      ])
    )
  })

  test('an assistant connects a client to the server on 502, reads and polls it', async ({
    mainPage
  }) => {
    if (!assistant) throw new Error('no assistant connected')
    const [first] = (await call(assistant, 'list_clients')) as { id: string }[]
    if (!first) throw new Error('no client listed')
    const client = first.id

    expect(
      await call(assistant, 'set_client_config', {
        client,
        host: '127.0.0.1',
        port: 502,
        unitId: 0,
        type: 'holding_registers',
        address: 0,
        length: 5
      })
    ).toMatchObject({ refused: [] })
    expect(await call(assistant, 'connect', { client })).toEqual({ connectState: 'connected' })
    await expect(mainPage.getByTestId('connect-btn')).toBeVisible()

    const read = (await call(assistant, 'read', { client })) as { rows: unknown[] }
    expect(read.rows).toHaveLength(5)

    await expect(call(assistant, 'connect', { client })).rejects.toThrow('connected already')
    expect(await call(assistant, 'start_polling', { client })).toEqual({ polling: true })
    await expect(call(assistant, 'read', { client })).rejects.toThrow('during a poll')
    expect(await call(assistant, 'stop_polling', { client })).toEqual({ polling: false })
    expect(await call(assistant, 'disconnect', { client })).toEqual({
      connectState: 'disconnected'
    })
  })

  test('an assistant scans unit ids and registers, and stops a scan', async ({ mainPage }) => {
    if (!assistant) throw new Error('no assistant connected')
    const mcp = assistant
    const [first] = (await call(mcp, 'list_clients')) as { id: string }[]
    if (!first) throw new Error('no client listed')
    const client = first.id
    const scanDone = async (): Promise<void> =>
      expect
        .poll(
          async () => ((await call(mcp, 'get_scan', { client })) as { scanning: string }).scanning
        )
        .toBe('none')

    expect(await call(mcp, 'connect', { client })).toEqual({ connectState: 'connected' })

    expect(
      await call(mcp, 'scan_unit_ids', {
        client,
        startUnitId: 0,
        count: 4,
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 200
      })
    ).toEqual({ started: true, range: [0, 3] })
    // The client view opens with the tool's dialog, and only that one.
    await expect(mainPage.getByTestId('scan-unitid-close-btn')).toBeVisible()
    await expect(mainPage.getByTestId('scan-registers-close-btn')).toHaveCount(0)
    await scanDone()
    const found = (await call(mcp, 'get_scan', { client })) as {
      unitIds: { unitId: number; holding_registers: string }[]
    }
    expect(found.unitIds.map((answer) => answer.unitId)).toEqual([0, 1, 2, 3])
    expect(found.unitIds.slice(0, 2)).toEqual([
      { unitId: 0, holding_registers: 'data' },
      { unitId: 1, holding_registers: 'data' }
    ])
    // The server refuses a unit id it does not host, as a gateway does.
    expect(found.unitIds[2]?.holding_registers).toContain('exception 11')

    expect(
      await call(mcp, 'scan_registers', { client, address: 0, length: 30, chunkSize: 10 })
    ).toEqual({ started: true, type: 'holding_registers', addressRange: [0, 29] })
    await expect(mainPage.getByTestId('scan-registers-close-btn')).toBeVisible()
    await expect(mainPage.getByTestId('scan-unitid-close-btn')).toHaveCount(0)
    await scanDone()
    const values = (await call(mcp, 'read_values', { client })) as { rows: unknown[] }
    expect(values.rows.length).toBeGreaterThan(0)

    await call(mcp, 'start_polling', { client })
    await expect(call(mcp, 'scan_registers', { client })).rejects.toThrow('stop_polling first')
    await call(mcp, 'stop_polling', { client })

    await call(mcp, 'scan_unit_ids', { client, startUnitId: 2, count: 250, timeout: 1000 })
    expect(await call(mcp, 'stop_scan', { client })).toEqual({ scanning: false })
    await expect(call(mcp, 'stop_scan', { client })).rejects.toThrow('not scanning')
    await mainPage.getByTestId('scan-unitid-close-btn').click()

    expect(await call(mcp, 'disconnect', { client })).toEqual({ connectState: 'disconnected' })
  })

  test('an assistant adds a client, maps and opens a config, then removes it', async () => {
    if (!assistant) throw new Error('no assistant connected')
    const { client } = (await call(assistant, 'add_client', { name: 'Meter' })) as {
      client: string
    }

    expect(
      await call(assistant, 'set_mapping_entry', {
        client,
        type: 'input_registers',
        address: 4,
        dataType: 'float',
        comment: 'frequency'
      })
    ).toEqual({ changed: ['dataType', 'comment'], refused: [] })

    const config = JSON.parse(readFileSync(CLIENT_CONFIG, 'utf8')) as Record<string, unknown>
    expect(await call(assistant, 'replace_mapping', { client, config })).toEqual({
      migrated: false,
      fieldsNotBroughtAcross: []
    })
    const registers = (await call(assistant, 'list_registers', { client })) as { name: string }[]
    expect(registers.map((register) => register.name)).toContain('setpoint')

    await call(assistant, 'clear_mapping', { client })
    expect(await call(assistant, 'list_registers', { client })).toEqual([])

    expect(await call(assistant, 'delete_client', { client })).toEqual({ deleted: client })
    const clients = (await call(assistant, 'list_clients')) as { id: string }[]
    expect(clients.map((listed) => listed.id)).not.toContain(client)
  })

  test('unticking operate takes the operate tools away', async ({ mainPage }) => {
    // The tools opened the client view.
    await navigateToHome(mainPage)
    await mainPage.getByTestId('home-settings-btn').click()
    await mainPage.getByTestId('mcp-operate-checkbox').click()
    await assistant?.close()
    assistant = await connect()
    const { tools } = await assistant.listTools()
    expect(tools.map((tool) => tool.name)).not.toContain('connect')
    expect(tools.map((tool) => tool.name)).toContain('read_values')
  })

  test('leaving the page forgets the token it showed', async ({ mainPage }) => {
    await navigateToHome(mainPage)
    await mainPage.getByTestId('home-settings-btn').click()
    await expect(mainPage.getByTestId('mcp-connect-command')).toHaveCount(0)
    await expect(mainPage.getByTestId('mcp-create-token-btn')).toHaveText('Replace token')
  })

  test('switching it off turns it off, and the assistant is refused', async ({ mainPage }) => {
    await mainPage.getByTestId('mcp-enabled-switch').click()
    await expect(mainPage.getByTestId('mcp-status')).toContainText('Off')
    await expect(connect()).rejects.toThrow()
  })

  test('back home', async ({ mainPage }) => {
    await navigateToHome(mainPage)
  })
})
