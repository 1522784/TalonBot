// Class libary, now obselete
JS = require('jsclass');
JS.require('JS.Class');

//does this work? will it show up?

require("sugar");

var program = require('commander');// Get Command-line arguments
let account = require("../accounts/account");

// Logging
let log4js = require('log4js');
let logger = require('log4js').getLogger("battleroom");
let decisionslogger = require('log4js').getLogger("decisions");

let cloneBattleState = require("../clone/cloneBattleState");
let requests = require("../util/requests");
let Replicater = require("./replicateBattleState");

class BattleRoom{
    constructor(id, sendfunc, makeMoveImmediatly) {
        this.id = id;
        this.title = "Untitled";
        this.send = sendfunc;
        this.makeMoveImmediatly = makeMoveImmediatly;

        this.replicater = new Replicater(id);

        sendfunc(account.message, id); // Notify User that this is a bot
        sendfunc("/timer", id); // Start timer (for user leaving or bot screw ups)
        
        this.algorithm = program.algorithm;
    }

    recieve(data) {
        if (!data) return;
        //logger.info("<< " + data)

        if (data.substr(0, 6) === '|init|') {
            return this.replicater.init(data);
        }
        if (data.substr(0, 9) === '|request|') {
            let reqContent = data.substr(9)
            if (reqContent.length != 0)
                reqContent = JSON.parse(reqContent);

            return this.receiveRequest(reqContent);
        }

        this.replicater.updateState(data);
        let state = this.replicater.getState();

        if(this.replicater.winner && !this.battleEnded){
            this.battleEnded = true;
            
            this.send("gg", this.id);
            
            if(this.algorithm === "talon") talonbot.endBattle(this.id);

            // Leave in two seconds
            let battleroom = this;
            if(!this.makeMoveImmediatly) {
                setTimeout(function() {
                    battleroom.send("/leave " + battleroom.id);
                }, 2000);
            }
        }

        if(this.algorithm === "talon") talonbot.addStateToHistory(state, state.logs, this.replicater.side);
    }

    receiveRequest(request) {
        if (!request) {
            this.side = '';
            return;
        }

        this.last_rqid = request.rqid

        if (request.side) this.replicater.updateSide(request);

        if (!!request.active || !!request.forceSwitch) this.makeMove(request);
    }

    /** Function which is called when our client is asked to make a move */
    async makeMove(request) {
        let room = this;
            
        let algorithm = program.algorithm;
        if(this.algorithm) algorithm = this.algorithm;

        if(algorithm === "talon" && !this.makeMoveImmediatly) await talonbot.loadNets(this.replicater.getState());
        let makeMoveFunction = function() {
            let state = room.replicater.getState(request);

            let decision = requests.parseRequest(request);

            // Use specified algorithm to determine resulting choice
            let result = undefined;
            if(algorithm === "minimax") result = minimaxbot.decide(cloneBattleState(state), decision.choices);
            else if(algorithm === "mcts") result = mctsbot.decide(cloneBattleState(state), decision.choices);
            else if(algorithm === "samcts") result = mcts_duct.decide(cloneBattleState(state), decision.choices, this.has_p2_moved);
            else if(algorithm === "expectimax") result = expectimax.decide(cloneBattleState(state), decision.choices, this.has_p2_moved);
            else if(algorithm === "greedy") result = greedybot.decide(cloneBattleState(state), decision.choices);
            else if(algorithm === "random") result = randombot.decide(cloneBattleState(state), decision.choices);

            else if(algorithm === "talon") result = talonbot.decide(cloneBattleState(state), decision.choices);

            room.send("/choose " + requests.toChoiceString(result, state.p1) + "|" + decision.rqid, room.id);
        };

        if(this.makeMoveImmediatly){
            makeMoveFunction();
        } else {
            setTimeout(makeMoveFunction, 7500);
        }
    }
}
module.exports = BattleRoom;

let minimaxbot = require("../bots/minimaxbot");
let mctsbot = require("../bots/mctsbot");
let mcts_duct = require("../bots/mcts_duct");
let expectimax = require("../bots/expectimax");
let greedybot = require("../bots/greedybot");
let randombot = require("../bots/randombot");
let talonbot = require("../bots/talonMCTS/api");
