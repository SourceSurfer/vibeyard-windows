import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

interface McpResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface McpConnection {
  client: Client;
  transport: SSEClientTransport | StreamableHTTPClientTransport;
}

const connections = new Map<string, McpConnection>();

export async function connect(id: string, url: string): Promise<McpResult> {
  try {
    // Disconnect existing connection if any
    await disconnect(id);

    const client = new Client({ name: 'vibeyard-mcp-inspector', version: '1.0.0' });

    let transport: SSEClientTransport | StreamableHTTPClientTransport;
    if (url.endsWith('/sse')) {
      transport = new SSEClientTransport(new URL(url));
    } else {
      transport = new StreamableHTTPClientTransport(new URL(url));
    }

    await client.connect(transport);

    connections.set(id, { client, transport });
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function disconnect(id: string): Promise<McpResult> {
  const conn = connections.get(id);
  if (!conn) return { success: true };
  try {
    await conn.client.close();
  } catch {
    // ignore close errors
  }
  connections.delete(id);
  return { success: true };
}

export async function listTools(id: string): Promise<McpResult> {
  const conn = connections.get(id);
  if (!conn) return { success: false, error: 'Not connected' };
  try {
    const result = await conn.client.listTools();
    return { success: true, data: result.tools };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function listResources(id: string): Promise<McpResult> {
  const conn = connections.get(id);
  if (!conn) return { success: false, error: 'Not connected' };
  try {
    const result = await conn.client.listResources();
    return { success: true, data: result.resources };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function listPrompts(id: string): Promise<McpResult> {
  const conn = connections.get(id);
  if (!conn) return { success: false, error: 'Not connected' };
  try {
    const result = await conn.client.listPrompts();
    return { success: true, data: result.prompts };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function callTool(id: string, name: string, args: Record<string, unknown>): Promise<McpResult> {
  const conn = connections.get(id);
  if (!conn) return { success: false, error: 'Not connected' };
  try {
    const result = await conn.client.callTool({ name, arguments: args });
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function readResource(id: string, uri: string): Promise<McpResult> {
  const conn = connections.get(id);
  if (!conn) return { success: false, error: 'Not connected' };
  try {
    const result = await conn.client.readResource({ uri });
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function getPrompt(id: string, name: string, args: Record<string, string>): Promise<McpResult> {
  const conn = connections.get(id);
  if (!conn) return { success: false, error: 'Not connected' };
  try {
    const result = await conn.client.getPrompt({ name, arguments: args });
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function disconnectAll(): Promise<void> {
  for (const id of connections.keys()) {
    await disconnect(id);
  }
}
