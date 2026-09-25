import { createHash } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { createServer } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpAccess, McpSettings } from '@shared'
import { McpConnector, type RunTool } from '../connector'

const TOKEN = 'mbx_test-token'
const digest = (token: string): string => createHash('sha256').update(token).digest('hex')

/** A port nothing listens on, found by binding 0 and letting it go. */
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

const access = (overrides: Partial<McpAccess> = {}): McpAccess => ({
  read: false,
  operate: false,
  write: false,
  ...overrides
})

describe('McpConnector', () => {
  let connector: McpConnector
  let run: ReturnType<typeof vi.fn<RunTool>>
  let port: number
  const clients: Client[] = []

  const settings = (overrides: Partial<McpSettings> = {}): McpSettings => ({
    access: access({ read: true }),
    port,
    tokenHash: digest(TOKEN),
    ...overrides
  })

  const connect = async (token = TOKEN): Promise<Client> => {
    const client = new Client({ name: 'test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } }
    })
    await client.connect(transport)
    clients.push(client)
    return client
  }

  /** The status a bare tools/list answers, or the connect error when nothing listens. */
  const post = (headers: Record<string, string>): Promise<number> =>
    new Promise((resolve, reject) => {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      const request = httpRequest(
        {
          host: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'Content-Length': Buffer.byteLength(body),
            ...headers
          }
        },
        (response) => {
          response.resume()
          resolve(response.statusCode ?? 0)
        }
      )
      request.once('error', reject)
      request.end(body)
    })

  beforeEach(async () => {
    run = vi.fn<RunTool>(async () => ({ ok: true, result: { answered: true } }))
    connector = new McpConnector({ run })
    port = await freePort()
  })

  afterEach(async () => {
    for (const client of clients.splice(0)) await client.close()
    await connector.stop()
  })

  describe('whether it listens', () => {
    it('listens once a box is ticked and a token is set', async () => {
      expect(await connector.apply(settings())).toEqual({ listening: true })
      expect(await post({ Authorization: `Bearer ${TOKEN}` })).toBe(200)
    })

    it('does not listen with every box off', async () => {
      expect(await connector.apply(settings({ access: access() }))).toEqual({ listening: false })
      await expect(post({ Authorization: `Bearer ${TOKEN}` })).rejects.toThrow()
    })

    it('does not listen without a token', async () => {
      expect(await connector.apply(settings({ tokenHash: undefined }))).toEqual({
        listening: false
      })
      await expect(post({})).rejects.toThrow()
    })

    it('stops when the last box goes off', async () => {
      await connector.apply(settings())
      await connector.apply(settings({ access: access() }))
      await expect(post({ Authorization: `Bearer ${TOKEN}` })).rejects.toThrow()
    })

    it('moves to a new port', async () => {
      await connector.apply(settings())
      const oldPort = port
      port = await freePort()
      expect(await connector.apply(settings())).toEqual({ listening: true })

      expect(await post({ Authorization: `Bearer ${TOKEN}` })).toBe(200)
      port = oldPort
      await expect(post({ Authorization: `Bearer ${TOKEN}` })).rejects.toThrow()
    })

    // A box ticked and unticked quickly: the answer the page keeps is the
    // last one, and the socket has to agree with it.
    it('is off after an on and an off that overlap', async () => {
      const on = connector.apply(settings())
      const off = connector.apply(settings({ access: access() }))
      expect(await on).toEqual({ listening: true })
      expect(await off).toEqual({ listening: false })
      await expect(post({ Authorization: `Bearer ${TOKEN}` })).rejects.toThrow()
    })

    it('holds only the last port after two moves that overlap', async () => {
      const first = port
      const second = await freePort()
      const one = connector.apply(settings({ port: first }))
      const two = connector.apply(settings({ port: second }))
      await Promise.all([one, two])
      await connector.stop()

      port = first
      await expect(post({ Authorization: `Bearer ${TOKEN}` })).rejects.toThrow()
      port = second
      await expect(post({ Authorization: `Bearer ${TOKEN}` })).rejects.toThrow()
    })

    it('says why when the port is taken', async () => {
      const holder = createServer()
      await new Promise<void>((resolve) => holder.listen(port, '127.0.0.1', resolve))
      try {
        const status = await connector.apply(settings())
        expect(status.listening).toBe(false)
        expect(status.error).toContain(String(port))
      } finally {
        await new Promise<void>((resolve) => holder.close(() => resolve()))
      }
    })
  })

  describe('who it answers', () => {
    it('refuses a request without the token', async () => {
      await connector.apply(settings())
      expect(await post({})).toBe(401)
    })

    it('takes the scheme in any case', async () => {
      await connector.apply(settings())
      expect(await post({ Authorization: `bearer ${TOKEN}` })).toBe(200)
    })

    it('refuses a request with another token', async () => {
      await connector.apply(settings())
      expect(await post({ Authorization: 'Bearer mbx_wrong' })).toBe(401)
    })

    // A page in a browser can reach loopback through a name it controls; the
    // Host it sends is that name.
    it('refuses a request addressed to another host', async () => {
      await connector.apply(settings())
      expect(await post({ Authorization: `Bearer ${TOKEN}`, Host: 'evil.example' })).toBe(403)
    })

    it('stops taking the old token once the settings carry a new one', async () => {
      await connector.apply(settings())
      await connector.apply(settings({ tokenHash: digest('mbx_new') }))
      expect(await post({ Authorization: `Bearer ${TOKEN}` })).toBe(401)
      expect(await post({ Authorization: 'Bearer mbx_new' })).toBe(200)
    })
  })

  describe('which tools it offers', () => {
    it('offers the read tools behind the read box', async () => {
      await connector.apply(settings())
      const client = await connect()
      const { tools } = await client.listTools()
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        'get_client',
        'get_unit',
        'list_clients',
        'list_registers',
        'list_servers',
        'read_values'
      ])
    })

    it('offers no read tool with the read box off', async () => {
      await connector.apply(settings({ access: access({ write: true }) }))
      const client = await connect()
      const { tools } = await client.listTools()
      expect(tools.map((tool) => tool.name)).not.toContain('list_clients')
    })
  })

  describe('a tool call', () => {
    it('is run on the side the tool belongs to, with its arguments', async () => {
      await connector.apply(settings())
      const client = await connect()

      const answer = await client.callTool({
        name: 'get_unit',
        arguments: { server: 's', unit: '1' }
      })

      expect(run).toHaveBeenCalledWith('server', 'get_unit', { server: 's', unit: '1' })
      expect(answer.isError).toBeFalsy()
      expect(answer.content).toEqual([{ type: 'text', text: '{"answered":true}' }])
    })

    it('answers a 64 bit integer as its digits', async () => {
      run.mockResolvedValue({ ok: true, result: { value: 9007199254740993n } })
      await connector.apply(settings())
      const client = await connect()

      const answer = await client.callTool({ name: 'list_clients', arguments: {} })

      expect(answer.content).toEqual([{ type: 'text', text: '{"value":"9007199254740993"}' }])
    })

    it('answers the error the window gave', async () => {
      run.mockResolvedValue({ ok: false, error: 'That client does not exist' })
      await connector.apply(settings())
      const client = await connect()

      const answer = await client.callTool({ name: 'get_client', arguments: { client: 'x' } })

      expect(answer.isError).toBe(true)
      expect(answer.content).toEqual([{ type: 'text', text: 'That client does not exist' }])
    })

    it('is refused before it runs when its arguments do not parse', async () => {
      await connector.apply(settings())
      const client = await connect()

      const answer = await client.callTool({
        name: 'get_unit',
        arguments: { server: 's', unit: 'one' }
      })

      expect(answer.isError).toBe(true)
      expect(run).not.toHaveBeenCalled()
    })

    it('is refused when its box went off after the tools were listed', async () => {
      await connector.apply(settings())
      const client = await connect()
      await connector.apply(settings({ access: access({ write: true }) }))

      const answer = await client.callTool({ name: 'list_clients', arguments: {} })

      expect(answer.isError).toBe(true)
      expect(run).not.toHaveBeenCalled()
    })
  })
})
