/**
 * Utility to parse shell command strings into argument arrays and format Docker exec-form CMD directives.
 */

/**
 * Parses a shell command string into an array of arguments, preserving quoted strings.
 * Example: 'npm run dev' -> ['npm', 'run', 'dev']
 * Example: 'python "app.py"' -> ['python', 'app.py']
 * 
 * @param {string} commandStr 
 * @returns {string[]}
 */
function parseCommand(commandStr) {
  if (!commandStr || typeof commandStr !== 'string') {
    return [];
  }

  const trimmed = commandStr.trim();
  if (!trimmed) return [];

  // Match quoted tokens or non-whitespace tokens
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const args = [];
  let match;

  while ((match = regex.exec(trimmed)) !== null) {
    if (match[1] !== undefined) {
      // Double-quoted match
      args.push(match[1]);
    } else if (match[2] !== undefined) {
      // Single-quoted match
      args.push(match[2]);
    } else {
      // Unquoted token
      args.push(match[0]);
    }
  }

  return args.length > 0 ? args : [trimmed];
}

/**
 * Formats a command string into a Dockerfile exec-form CMD directive.
 * Example: 'npm run dev' -> 'CMD ["npm", "run", "dev"]'
 * 
 * @param {string} commandStr 
 * @returns {string}
 */
function formatDockerCmd(commandStr) {
  const args = parseCommand(commandStr);
  const jsonArray = JSON.stringify(args);
  return `CMD ${jsonArray}`;
}

module.exports = {
  parseCommand,
  formatDockerCmd
};
