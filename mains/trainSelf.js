var Battle = require("../servercode/sim/battle");
var BattleRoom = require("../battleroom");
var TeamValidator = require("../servercode/sim/team-validator");
var RoomLogs = require("../servercode/server/roomlogs");
var math = require("mathjs");
var cloneBattleState = require("../clone/cloneBattleState");
let teamSimulatorPool = require("../bots/talonMCTS/api").teamSimulatorPool;
let decisionProbCalcer = require("../bots/talonMCTS/simpledecisionpropcalcer");
var _ = require('lodash');

const FORMAT = "gen1randombattle";
const ITERATIONS = 1;

let teamValidator = new TeamValidator(FORMAT);
let teamGenerator = teamValidator.dex.getTeamGenerator(FORMAT);
let dexData = teamValidator.dex.loadData();
let dex = Object.keys(dexData.Pokedex); //Includes all species from all Gens
//log.info(dexData.Movedex)
let moveDex = [];
//for(let entry in dex) log.info(this.teamValidator.validateSet({species: dex[entry]}))
dex = dex.filter(entry => { 
    let problems = teamValidator.validateSet({species: entry}, {});
    return (problems.length === 1); //If it is legal, only one problem must exist: "Pokemon has no moves"
})
dex.forEach(poke => {
    Object.keys(teamValidator.dex.getTemplate(poke).learnset).forEach(move => {
        if(!moveDex.includes(move)) moveDex.push(move);
    })
});
let evaluateNet = decisionProbCalcer.getEvaluateNetwork(FORMAT, dexData, dex, moveDex);
let decisionNet = decisionProbCalcer.getMatchDecisionNetwork(FORMAT, dexData, dex, moveDex);

RoomLogs.sharedModlogs.set("", {})
var roomLog = new RoomLogs.Roomlog({
    id: "-"
}, {
    isMultichannel: true
})
let battlenum = 100000000;
let errors = [];
let successfulRuns = 0;
let errorRate = 0;
let lastTestData;

let promise = Promise.all([evaluateNet.load(), decisionNet.load()]);

promise.then(() => {

    OUTER:
    while(battlenum < (100000000 + ITERATIONS * 2)){
        let battle = null; 
        let battleHistory = [];
        let side1, side2;
    
        try{
            let battleid = "0123456gen1randombattle-" + battlenum;
            let side2Id = "0123456gen1randombattle-" + (battlenum + 1);
        
            let sendQueue = [];
            let doSendP1 = (message, battleId) => {
                message = message.slice("/choose ".length)
                message = message.split("|")[0];
                let itWorked = battle.choose("p1", message);
    
                if(!battleHistory.length || battleHistory[battleHistory.length - 1].p1Decision != undefined){
                    battleHistory.push({
                        state: cloneBattleState(battle)
                    });
                }
                let type =  message.split(" ")[0];
                let id =  message.split(" ")[1];
                if(type === "switch"){
                    id = parseInt(id);
                }
                battleHistory[battleHistory.length - 1].p1Decision = {
                    type: type,
                    id: id
                };
                if(battle.p2.request.wait) [battleHistory.length - 1].p2Decision = null;
    
                if(!itWorked){
                    debugger;
                    battle.choose("p1", message);
                    throw new Error("Choose didn't work. Message: " + message)
                }
            }
    
            let side1SendFunc = (message, battleId) => {
                if(!message.startsWith("/choose")) return;
                if(sendQueue.length >= 2) debugger;
                sendQueue.push(() => doSendP1(message, battleId))
            }
            let side1 = new BattleRoom(battleid, side1SendFunc, true);
            side1.algorithm = "talon";
        
            let doSendP2 = (message, battleId) => {
                message = message.slice("/choose ".length)
                message = message.split("|")[0];
                let itWorked = battle.choose("p2", message);
                
                if(!battleHistory.length || battleHistory[battleHistory.length - 1].p2Decision != undefined){
                    battleHistory.push({
                        state: cloneBattleState(battle)
                    });
                }
                let type =  message.split(" ")[0];
                let id =  message.split(" ")[1];
                if(type === "switch"){
                    id = parseInt(id);
                }
                battleHistory[battleHistory.length - 1].p2Decision = {
                    type: type,
                    id: id
                };
                if(battle.p1.request.wait) [battleHistory.length - 1].p1Decision = null;
                
                if(!itWorked){
                    debugger;
                    battle.choose("p2", message);
                    throw new Error("Choose didn't work. Message: " + message)
                }
            }
    
            let side2SendFunc = (message, battleId) => {
                if(!message.startsWith("/choose")) return;
                if(sendQueue.length >= 2) debugger;
                sendQueue.push(() => doSendP2(message, battleId));
            }
            let side2 = new BattleRoom(side2Id, side2SendFunc, true);
            side2.algorithm = "talon";
        
            let lastLogLengthP1 = 0;
            let lastLogLengthP2 = 0;
            battle = new Battle({
                formatid: FORMAT,
                p1: {},
                p2: {},
                send: function(type, data) {
                    battle = this;
                    console.log("Send " + type + ": " + data);
                    switch(type){
                        case "sideupdate":
                            let battleroom, channel;
                            if(data.startsWith("p1")){
                                battleroom = side1;
                                roomLog.log = this.log.slice(lastLogLengthP1);
                                lastLogLengthP1 = this.log.length;
                                channel = 1;
                            } else {
                                battleroom = side2;
                                roomLog.log = this.log.slice(lastLogLengthP2);
                                lastLogLengthP2 = this.log.length;
                                channel = 2;
                            }
        
                            battleroom.recieve(roomLog.getScrollback(channel));
                            battleroom.recieve(data.slice(3));
                            break;
                        default:
                            console.error("Unknown send type: " + type);
                            throw new Error();
                    }
                }
            });
    
            while(!battle.ended){
                while(sendQueue.length){
                    let sendFunc = sendQueue.pop();
                    sendFunc();
                }
                if(!battle.ended && sendQueue.length === 0) battle.go();
            }
    
            console.log("Battle is finished. Train neural net.");
    
            //Get winner
            let winner = battle.winner === "Player 1" ? "p1" : "p2";
    
            //evaluateNet.load();
            for(let trainDataNum = 0; trainDataNum < 10; trainDataNum ++){
                let historyIndex = math.floor(math.sqrt(math.randomInt(0, battleHistory.length * battleHistory.length)));
                let historyToken = battleHistory[historyIndex];
                let ownSide = (trainDataNum % 2 === 0) ? "p1" : "p2";
                evaluateNet.addToTrainData(battleHistory[historyIndex].state, ownSide, winner);
                lastTestData = {
                    state: cloneBattleState(battleHistory[historyIndex].state),
                    ownSide: ownSide,
                    winner: winner    
                };

                if(historyToken.p1Decision){
                    let parsed =  BattleRoom.parseRequest(historyToken.state.p1.request);
                    if(parsed.choices) parsed = parsed.choices;
                    decisionNet.addToTrainData(historyToken.state, "p1", parsed, historyToken.p1Decision);
                }
                if(historyToken.p2Decision){
                    let parsed =  BattleRoom.parseRequest(historyToken.state.p2.request);
                    if(parsed.choices) parsed = parsed.choices;
                    decisionNet.addToTrainData(historyToken.state, "p2", parsed, historyToken.p2Decision);
                }
            }
            //evaluateNet.save();
    
            successfulRuns++;
        } catch(e){
            debugger;
    
            errors.push(e);
        }
    
        for(let teamSimulator of teamSimulatorPool.values()) teamSimulator.destroy();
        teamSimulatorPool.clear();
        battleHistory.forEach(battle => battle.state.destroy());
        battle.destroy();
    
        battlenum += 2;
        errorRate = math.divide(errors.length, successfulRuns + errors.length);
    }
    let promise = Promise.all([decisionNet.train(), evaluateNet.train()]);
    
    promise
    .then(() => {
        Promise.all([evaluateNet.save(), decisionNet.save()]).then(() => {
            debugger;

            let winchance = evaluateNet.evaluate(lastTestData.state, lastTestData.ownSide);
            let expected = lastTestData.ownSide === lastTestData.winner ? 1 : 0;
            let diff = winchance - expected;
            if(diff < 0) diff = -diff;
            console.log("Difference in random TestData: " + diff);
            var p1_health = _.sum(_.map(lastTestData.state.p1.pokemon, function (pokemon) {
                return !!pokemon.hp ? pokemon.hp / pokemon.maxhp * 100.0 : 0.0;
            }));
            var p2_health = _.sum(_.map(lastTestData.state.p2.pokemon, function (pokemon) {
                return !!pokemon.hp ? pokemon.hp / pokemon.maxhp * 100.0 : 0.0;
            }));
            let healthAdvantage = math.divide(p1_health, p2_health);
            if(lastTestData.winner === "p2") healthAdvantage = math.divide(1, healthAdvantage);
            console.log("Health advantage for winner: " + healthAdvantage);
        })
        .catch((e) => {
            debugger;
            console.error(e);
            process.exit(1);
        })
        .finally(_ => {
            debugger;
            process.exit(0)
        });
    })
    //.then(_ => process.exit(0))
    .catch((e) => {
        debugger;
        console.error(e);
        process.exit(1);
    })
    
})