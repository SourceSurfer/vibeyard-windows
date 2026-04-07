import { ipcMain } from 'electron';
import * as mcpClient from './mcp-client';

export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:connect', (_event, id: string, url: string) =>
    mcpClient.connect(id, url));

  ipcMain.handle('mcp:disconnect', (_event, id: string) =>
    mcpClient.disconnect(id));

  ipcMain.handle('mcp:listTools', (_event, id: string) =>
    mcpClient.listTools(id));

  ipcMain.handle('mcp:listResources', (_event, id: string) =>
    mcpClient.listResources(id));

  ipcMain.handle('mcp:listPrompts', (_event, id: string) =>
    mcpClient.listPrompts(id));

  ipcMain.handle('mcp:callTool', (_event, id: string, name: string, args: Record<string, unknown>) =>
    mcpClient.callTool(id, name, args));

  ipcMain.handle('mcp:readResource', (_event, id: string, uri: string) =>
    mcpClient.readResource(id, uri));

  ipcMain.handle('mcp:getPrompt', (_event, id: string, name: string, args: Record<string, string>) =>
    mcpClient.getPrompt(id, name, args));
}
