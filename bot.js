// Command-line Arguments
var program = require('commander');
program
	.option('--console', 'Only start the web console - not the game playing bot.')
	.option('--host [url]', 'The websocket endpoint of the host to try to connect to. ["http://sim.smogon.com:8000/showdown"]', 'http://sim.smogon.com:8000/showdown')
	.option('--port [port]', 'The port on which to serve the web console. [3000]', "3000")
	.option('--ranked', 'Challenge on the ranked league.')
	.option('--net [action]', "'create' - generate a new network. 'update' - use and modify existing network. 'use' - use, but don't modify network. 'none' - use hardcoded weights. ['none']", 'none')
	.option('--algorithm [algorithm]', "Can be 'talon', 'minimax', 'mcts', 'samcts', 'expectimax', 'greedy', or 'random'. ['samcts']", "talon")
	.option('--account [file]', "File from which to load credentials. ['account.json']", "accounts/account.json")
	.option('--nosave', "Don't save games to the in-memory db.")
	.option('--nolog', "Don't append to log files.")
	.option('--startchallenging', "Start out challenging, instead of requiring a manual activation first.")
	.option('--max-old-space-size', "", "0")
	.parse(process.argv);

require('sockjs-client-ws/lib/WebSocketTransport');

require("./util/log");
require("./serverConnection/connection");