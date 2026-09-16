/**
 * Canonical HTTP status codes and reason phrases.
 *
 * Transcribed from docs/http_status_code_master_rules.md (sections 1-5), which is the
 * project's single source of truth for how a status is spelled in a report.
 */

export type StatusClass =
  '1xx Informational' | '2xx Success' | '3xx Redirection' | '4xx Client Error' | '5xx Server Error';

const STATUS_PHRASES: Record<number, string> = {
  // 1xx Informational
  100: 'Continue',
  101: 'Switching Protocols',
  102: 'Processing',
  103: 'Early Hints',
  // 2xx Success
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  207: 'Multi-Status',
  208: 'Already Reported',
  226: 'IM Used',
  // 3xx Redirection
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  305: 'Use Proxy',
  306: 'Reserved',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  // 4xx Client Errors
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Content Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Range Not Satisfiable',
  417: 'Expectation Failed',
  418: "I'm a teapot",
  421: 'Misdirected Request',
  422: 'Unprocessable Content',
  423: 'Locked',
  424: 'Failed Dependency',
  425: 'Too Early',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',
  // 5xx Server Errors
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates',
  507: 'Insufficient Storage',
  508: 'Loop Detected',
  510: 'Not Extended',
  511: 'Network Authentication Required',
};

const CLASSES: Record<number, StatusClass> = {
  1: '1xx Informational',
  2: '2xx Success',
  3: '3xx Redirection',
  4: '4xx Client Error',
  5: '5xx Server Error',
};

/** The family a code belongs to, or null when it is outside 100-599. */
export function classifyStatus(code: number): StatusClass | null {
  return CLASSES[Math.floor(code / 100)] ?? null;
}

/** "404 Not Found". Codes outside the master list still render, as "<code> Unknown Status". */
export function formatStatus(code: number): string {
  return `${code} ${STATUS_PHRASES[code] ?? 'Unknown Status'}`;
}
