'use strict'

var TeamSimulator = require("./teamsimulator");
var nnClient = require("./nnClient");

var teamSimulatorPool = new Map();
module.exports.teamSimulatorPool = teamSimulatorPool;

var PokemonBattle = require("./battleWrapper");
var MCTS = require("./mcts");

var startTime;

//Decide what option to choose in a battle turn
module.exports.decide = function (battle, choices) {

    //log.info("Starting move selection");
    let teamSimulator = teamSimulatorPool.get(battle.id);

    if(teamSimulator.history.length && teamSimulator.history[teamSimulator.history.length - 1].ownDecision){
        //log.info("Choose last decision: ")
        //log.info(teamSimulator.history[teamSimulator.history.length - 1].ownDecision);
        return teamSimulator.history[teamSimulator.history.length - 1].ownDecision;
    }

    if(choices.length === 1) {
        teamSimulator.addOwnDecisionToHistory(choices[0]);
        return choices[0];
    }
    var mcts = new MCTS(new PokemonBattle(battle), 100, 0, choices, teamSimulator);
    try{
        var action = mcts.selectMove();
        mcts.destroy();
        if(!action) throw new Error("Action undefined");
    }catch(e){
        debugger;
        mcts = new MCTS(new PokemonBattle(battle), 100, 0, choices, teamSimulator);
        mcts.selectMove(); 
    }
    
    //log.info("Given choices: " + JSON.stringify(choices));
    //log.info("My action: " + action.type + " " + action.id);

    teamSimulator.addOwnDecisionToHistory(action);

    //var endTime = new Date(); 
    //log.info("Decision took: " + (endTime - startTime) / 1000 + " seconds");

    return {
        type: action.type,
        id: action.id
    };
}

module.exports.getTeam = function(format, opponent){
    return [
        {
            name: "Tauros", 
            species: "Starmie",
            moves: ["thunderwave"],
            ability: "None",
            evs: { hp: 255, atk: 255, def: 255, spa: 255, spd: 255, spe: 255 },
            ivs: { hp: 30, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 },
            item: '',
            level: 100,
            shiny: false
        }
    ]
}

var endBattle = module.exports.endBattle = function(battleId){
    teamSimulatorPool.get(battleId).destroy();
    teamSimulatorPool.delete(battleId);
}

module.exports.addStateToHistory = function(battleState, logs, ownSide){
    startTime = new Date();

    logs = logs.slice(0, -2);
    let newestLogs = logs.slice(logs.lastIndexOf("\n\n")+2);
    if(!newestLogs.includes("|switch|") && !newestLogs.includes("|move|") && !newestLogs.includes("|cant|")) return;

    let teamSimulator = teamSimulatorPool.get(battleState.id);
    if(!teamSimulator) teamSimulator = new TeamSimulator(20, battleState, ownSide);
    teamSimulator.addStateToHistory(battleState);
    teamSimulator.updateTeams(battleState, logs);
    teamSimulatorPool.set(battleState.id, teamSimulator);
}

module.exports.loadNets = async function(battle){
    let firstMinusIndex = battle.id.indexOf("-")
    let secoundMinusIndex = battle.id.indexOf("-", firstMinusIndex + 1);
    let format = battle.id.slice(firstMinusIndex + 1, secoundMinusIndex);

    let client = nnClient.getClient(format);
    await client.loadNets();
}