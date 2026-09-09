/** Canonical public endpoint: OAuth resource discovery uses this exact URL. */
export const MCP_URL = 'https://www.echobrief.in/api/mcp';
export const CODEX_ADD_COMMAND = `codex mcp add echobrief --url ${MCP_URL}`;
export const CODEX_LOGIN_COMMAND = 'codex mcp login echobrief';
export const CODEX_TOKEN_COMMAND = `${CODEX_ADD_COMMAND} --bearer-token-env-var ECHOBRIEF_API_TOKEN`;
