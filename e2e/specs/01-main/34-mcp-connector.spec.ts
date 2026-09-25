import { createServer } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Page } from '@playwright/test'
import { test, expect, resetApp } from '../../fixtures/electron-app'
import { navigateToHome } from '../../fixtures/helpers'

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

  test('the settings open from home, with the connector off', async ({ mainPage }) => {
    await navigateToHome(mainPage)
    await mainPage.getByTestId('home-settings-btn').click()
    await expect(mainPage.getByTestId('mcp-status')).toContainText('Off')
    await expect(mainPage.getByTestId('mcp-read-checkbox').locator('input')).not.toBeChecked()
  })

  test('a port and the read box leave it off while there is no token', async ({ mainPage }) => {
    port = await freePort()
    const portInput = mainPage.getByTestId('mcp-port-input')
    await portInput.fill(String(port))
    await portInput.press('Enter')
    await mainPage.getByTestId('mcp-read-checkbox').click()
    await expect(mainPage.getByTestId('mcp-status')).toContainText('Off')
  })

  test('a token turns it on and is shown once with the command', async ({ mainPage }) => {
    await mainPage.getByTestId('mcp-create-token-btn').click()
    await expect(mainPage.getByTestId('mcp-status')).toHaveText(
      `Listening on http://127.0.0.1:${port}/mcp`
    )
    token = await shownToken(mainPage)
    await expect(mainPage.getByTestId('mcp-connect-command')).toContainText(`127.0.0.1:${port}/mcp`)
  })

  test('an assistant with the token sees the read tools', async () => {
    assistant = await connect()
    const { tools } = await assistant.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'get_client',
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

  test('leaving the page forgets the token it showed', async ({ mainPage }) => {
    await navigateToHome(mainPage)
    await mainPage.getByTestId('home-settings-btn').click()
    await expect(mainPage.getByTestId('mcp-connect-command')).toHaveCount(0)
    await expect(mainPage.getByTestId('mcp-create-token-btn')).toHaveText('Replace token')
  })

  test('unticking read turns it off, and the assistant is refused', async ({ mainPage }) => {
    await mainPage.getByTestId('mcp-read-checkbox').click()
    await expect(mainPage.getByTestId('mcp-status')).toContainText('Off')
    await expect(connect()).rejects.toThrow()
  })

  test('back home', async ({ mainPage }) => {
    await navigateToHome(mainPage)
  })
})
