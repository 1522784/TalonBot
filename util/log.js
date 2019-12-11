var fs = require('fs');
var log4js = require('log4js');
log4js.loadAppender('file');
var logger = require('log4js').getLogger("bot");
var program = require('commander');

if(!program.nolog) {
	// Ensure that logging directory exists
	if(!fs.existsSync("./logs")) { fs.mkdirSync("logs") };

	log4js.addAppender(log4js.appenders.file('logs/bot.log'), 'bot');

	log4js.addAppender(log4js.appenders.file('logs/minimax.log'), 'minimax');
	log4js.addAppender(log4js.appenders.file('logs/learning.log'), 'learning');

	log4js.addAppender(log4js.appenders.file('logs/battleroom.log'), 'battleroom');
	log4js.addAppender(log4js.appenders.file('logs/decisions.log'), 'decisions');

	log4js.addAppender(log4js.appenders.file('logs/webconsole.log'), 'webconsole');

	log4js.addAppender(log4js.appenders.file('logs/battle.log'), 'battle');
	log4js.addAppender(log4js.appenders.file('logs/battlepokemon.log'), 'battlepokemon');
	log4js.addAppender(log4js.appenders.file('logs/battleside.log'), 'battleside');

	log4js.addAppender(log4js.appenders.file('logs/greedy.log'), 'greedy');
	
	log4js.addAppender(log4js.appenders.file('logs/mcts.log'), 'mcts');
	
	log4js.addAppender(log4js.appenders.file('logs/talon.log'), 'talon');
	log4js.addAppender(log4js.appenders.file('logs/teamSim.log'), 'teamSimulator');
} else {
	logger.setLevel("INFO");
	log4js.configure({
		appenders : [
			{
				type: "console",
				category: ["bot"]
			}
		]
	});
}