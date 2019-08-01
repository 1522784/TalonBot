'use strict'

// Logging
var log4js = require('log4js');
var log = require('log4js').getLogger("mcts");
var learnlog = require('log4js').getLogger("learning");

var util = require('util')

var program = require('commander'); // Program settings
var fs = require('fs');

var _ = require('lodash');
var BattleRoom = require("./../../battleroom");

var randombot = require("./../randombot");
var greedybot = require("./../greedybot");
var minimaxbot = require("./../minimaxbot");

var cloneBattleState = require("./../../cloneBattleState");
var clone = require("./../../clone");

var TeamSimulator = require("./teamsimulator");
var decisionPropCalcer = require("./simpledecisionpropcalcer");

var teamSimulatorPool = new Map();
module.exports.teamSimulatorPool = teamSimulatorPool;

var TeamValidator = require("./../../servercode/sim/team-validator").Validator

var startTime;

// Function that decides which move to perform
var overallMinNode = {};
var lastMove = ''; 


//Decide what option to choose in a battle turn
var decide = module.exports.decide = function (battle, choices) {

    log.info("Starting move selection");
    let teamSimulator = teamSimulatorPool.get(battle.id);

    if(teamSimulator.history.length && teamSimulator.history[teamSimulator.history.length - 1].ownDecision){
        log.info("Choose last decision: ")
        log.info(teamSimulator.history[teamSimulator.history.length - 1].ownDecision);
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
    
    log.info("Given choices: " + JSON.stringify(choices));
    log.info("My action: " + action.type + " " + action.id);
    lastMove = action.id;  

    teamSimulator.addOwnDecisionToHistory(action);

    var endTime = new Date(); 
    log.info("Decision took: " + (endTime - startTime) / 1000 + " seconds");

    return {
        type: action.type,
        id: action.id
    };
}

var getTeam = module.exports.getTeam = function(format, opponent){
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
    if(!teamSimulator) teamSimulator = new TeamSimulator(10, battleState, ownSide);
    teamSimulator.addStateToHistory(battleState);
    teamSimulator.updateTeams(battleState, logs);
    teamSimulatorPool.set(battleState.id, teamSimulator);
}

module.exports.loadNets = async function(battle){
    let format = battle.id.slice(7, -10)
    let teamValidator = new TeamValidator(format);

    let dexData = teamValidator.dex.loadData()
    let dex = Object.keys(dexData.Pokedex); //Includes all species from all Gens
    //log.info(dexData.Movedex)
    let moveDex = [];
    //for(let entry in dex) log.info(this.teamValidator.validateSet({species: dex[entry]}))
    dex = dex.filter(entry => { 
        let problems = teamValidator.validateSet({species: entry}, {});
        return (problems.length === 1); //If it is legal, only one problem must exist: "Pokemon has no moves"
    })
    dex.forEach(poke => {
        Object.keys(battle.getTemplate(poke).learnset).forEach(move => {
            if(!moveDex.includes(move)) moveDex.push(move);
        })
    });
    
    await decisionPropCalcer.loadNets(format, dexData, dex, moveDex);
}

// ---- MCTS ALGORITHM
// ------------------------------------------------------------


class Node {
    
    /** Apply the move assigned to this node */
    constructor(game, parent, move, depth, mcts, maxChildren) {
        var self = this
        this.game = game
        this.mcts = mcts
        this.parent = parent
        this.move = move
        this.children = []
        this.maxChildren = maxChildren;
        
        this.depth = depth || 0

        this.q = 0
        this.visits = 0 

        // Perform the move
        if(move !== null)
        {
            this.game.performMove(this.move);
            if(this.game.isReadyForPlay()) this.game.playTurn(true);
        }

        // Moves for the current player
        this.untried_actions = this.game.getPossibleMoves(this.game.player);
    }

    /** Get UCB1 upper bound on the utility of this node. */
    get_UCB1() {
        return this.q + Math.sqrt(2 * Math.log(this.parent.visits) / this.visits)
    }

    get_child(move) {
        var gameclone = new PokemonBattle(this.game.battle);
        gameclone.player = this.game.player;
        gameclone.choices = clone(this.game.choices);
        //_.assign(new this.game.constructor(), _.cloneDeep(this.game))
        try{
            var child = new Node(gameclone, this, move, this.depth + 1, this.mcts)
        }
        catch(e){
            var player_side = this.game.player === 0 ? this.game.battle.p1 : this.game.battle.p2
            throw new Error("Creating a new Child caused an error.\nParent depth: " + this.depth + "\nDecisionlog: " + this.getDecisionLog() + "\nOptions" + this.untried_actions.concat({decision: move}).map(option => option.decision.action + " " + option.decision.id) + "\nRequest: " + JSON.stringify(player_side.request) + "\nCaused by Error: " + e.stack)
        }
        this.children.push(child);
        return child;
    }

    /** Expands a node with untried moves.
     * Select a random move from the set of untried actions. */
    expand() {
        if(!Array.isArray(this.untried_actions)) throw new Error;
        var action = decisionPropCalcer.randomChoice(this.untried_actions).decision;
        if (action === undefined) {
            return undefined
        }
        return this.get_child(action);
    }

    /** Checks if all this node's actions have been tried */
    expanded() {
        return this.game.getWinner() !== undefined || this.children.size < this.maxChildren;
    }

    get_winner() {
        return this.game.getWinner()
    }

    destroy(){
        this.game.destroy();
        for(let child of this.children)
            child.destroy();
    }

    getDecisionLog(){
        let decisionLog = "";
        if(this.parent) decisionLog = this.parent.getDecisionLog();

        if(!this.move) return decisionLog;

        if(decisionLog.length) decisionLog += " --> ";
        
        let player_side = this.game.player === 0 ? this.game.battle.p1 : this.game.battle.p2;
        decisionLog += BattleRoom.toChoiceString(this.move, player_side);

        return decisionLog
    }
}

class BeforeTeamSelectedNode extends Node {
    
    /** Apply the move assigned to this node */
    constructor(game, parent, move, depth, mcts, teamSimulator, maxChildren) {
        super(game,parent,move,depth,mcts, maxChildren);
        this.teamSimulator = teamSimulator;
        this.untried_actions = _(this.teamSimulator.getPossibleTeams()).castArray();
    }

    get_child(simulatedTeam) {
        var gameclone = new PokemonBattle(cloneBattleState(this.game.battle));
        simulatedTeam.completeBattle(gameclone.battle);
        gameclone.player = this.game.player;
        gameclone.choices = clone(this.game.choices);

        var child = new Node(gameclone, this, null, this.depth + 1, this.mcts, this.maxChildren)

        this.children.push(child);
        return child;
    }

    /** Expands a node with untried moves.
     * Select a random move from the set of untried actions. */
    expand() {
        var oppTeam = this.teamSimulator.getRandomTeam();
        return this.get_child(oppTeam);
    }

}

class CurrentChoiceNode extends Node {
    
    /** Apply the move assigned to this node */
    constructor(game, parent, move, depth, mcts, teamSimulator, maxChildren) {
        super(game,parent,move,depth,mcts, maxChildren);
        this.teamSimulator = teamSimulator;
    }

    get_child(move) {
        var gameclone = new PokemonBattle(this.game.battle);
        gameclone.player = this.game.player;
        gameclone.choices = clone(this.game.choices);

        //_.assign(new this.game.constructor(), _.cloneDeep(this.game))
        try{
            var child = new BeforeTeamSelectedNode(gameclone, this, move, this.depth + 1, this.mcts, this.teamSimulator, this.maxChildren);
        }
        catch(e){
            var player_side = this.game.player === 0 ? this.game.battle.p1 : this.game.battle.p2
            throw new Error("Creating a new Child caused an error.\nParent depth: " + this.depth + "\nDecisionlog: " + this.getDecisionLog() + "\nOptions" + this.untried_actions.concat({decision: move}).map(option => option.decision.action + " " + option.decision.id) + "\nRequest: " + JSON.stringify(player_side.request) + "\nCaused by Error: " + e.stack)
        }
        this.children.push(child);
        return child;
    }

    /** Expands a node with untried moves.
     * Select a random move from the set of untried actions. */
    expand() {
        var action = this.untried_actions.sample();
        if (action === undefined) {
            return undefined
        }
        this.untried_actions = this.untried_actions.differenceBy([action])
        return this.get_child(action)
    }

    /** Checks if all this node's actions have been tried */
    expanded() {
        return this.game.getWinner() !== undefined || this.untried_actions.size() === 0;
    }

}

class MCTS {

    /**
     * Creates an MCTS search object. One of these will be constructed BattleRoom
     * the start of each of the AI player's turns.
     * TODO: Caching?
     * 
     * @constructor
     * @param {PokemonBattle} game - The game object containing all game-specific logic
     * @param {int} rounds - How many rounds to play out
     * @param {int} player - The AI player, either 0 or 1 corresponding to p1 or p2.
     * @param {Array} choices - Initial choices, handles fainted pokemon, etc...
     */    
    constructor(game, rounds, player, choices, teamSimulator) {
        var self = this
        this.game = game

        // Specifies how nodes are explored
        this.c = 15.0       // Exploration constant
        this.tree_policy = function (node) {
            // We explore nodes by UCB1
            if (node.parent.game.getCurrentPlayer() === self.player) {
                return self.c*node.get_UCB1()
            }
            // Opposing player explores least explored node
            return -node.visits
        }

        this.rounds = rounds || 1000
        this.player = player

        // Create a new root node
        this.rootNode = new CurrentChoiceNode(game, null, null, 0, this, teamSimulator, 60)
        if (choices)
        {
            this.rootNode.untried_actions = _(choices).castArray();
        }
    }

    destroy(){
        this.rootNode.destroy();
    }

    /** Select the move that should be performed by the player this turn */
    selectMove() {
        var round, node
        for (round = 0; round < this.rounds; round += 1) {

            // ---- MCTS Algorithm
            // Explore down to the bottom of the known tree via UCB1
            node = this.get_next_node(this.rootNode)

            // Something went wrong, bail
            if (node === undefined)
            {
                continue
            }
            
            // Rollout to maximum depth k, or terminus
            var maxDepth = 3;
            if(this.game.battle.currentRequest === "switch" && !this.game.battle.p1.request.wait) maxDepth++;
            if(this.game.battle.currentRequest === "switch" && !this.game.battle.p2.request.wait) maxDepth++;
            while (node !== undefined && node.depth < maxDepth && !node.expanded()) {
                node = node.expand()
            }

            // Something went wrong, bail
            if (node === undefined)
            {
                continue
            }

            // Get the score of the node
            let reward = node.game.heuristic()
            //log.info(node.getDecisionLog(true) + " heuristic: " + reward);

            // Roll back up incrementing the visit counts and propagating score
            while (node) {
                node.visits++;
                node.q = ((node.visits - 1)/node.visits) * node.q + 1/node.visits * reward;
                node = node.parent;
            }
        }

        if (this.rootNode.children.length > 0)
        {
            var action_string = JSON.stringify(_.map(this.rootNode.children, function(n){return [n.move, n.q, n.visits]}))
            log.info("Action scores: " + action_string);
        }
        else
        {
            log.info("No children");
        }
        
        if(!_(this.rootNode.children).maxBy('q')) debugger;
        // Get the move with the highest visit count
        return _(this.rootNode.children).maxBy('q').move
    }

    /** Gets the next node to be expanded.
     * recurses down to the next unexpanded node or terminal state */
    get_next_node(node) {
        while(node.get_winner() === undefined) {
            if (node.expanded()) {
                node = this.best_child(node)
            }
            else {
                return node;
            }
        }
        return node;
    } 

    /** Select a move according to the tree policy. */
    best_child(node) {
        if(node === this.rootNode) return _(node.children).sample();
        return _(node.children).maxBy(this.tree_policy)
    }
}

// ---- POKEMON GAME
// ------------------------------------------------------------

function PokemonBattle(battle) {
    this.battle = battle;

    this.player = 0;
    this.choices = [];
}

PokemonBattle.prototype.getPossibleMoves = function () {
    //Weird bug: Sometimes the method binds to the node object that calls this method binded to its property game
    //No idea why that happens, but here's a workaround:
    let self = this.game ? this.game : this;

    if(self.getWinner() !== undefined) return undefined;

    var current_player = self.player === 0 ? self.battle.p1 : self.battle.p2;

    if (current_player.request.wait)
    {
        return [{decision: null, probability: 1},]
    }

    return decisionPropCalcer.getRequestOptions(self.battle, current_player.id);
};

PokemonBattle.prototype.destroy = function () {
    this.battle.destroy();
};

PokemonBattle.prototype.getCurrentPlayer = function () {
    return this.player;
};

PokemonBattle.prototype.performMove = function (action) {
    var player_string = this.player === 0 ? 'p1' : 'p2'
    var player_side = this.player === 0 ? this.battle.p1 : this.battle.p2

    if(action) this.choices.push({player: player_string, choiceString: BattleRoom.toChoiceString(action, player_side)});
    //let choiceSuccess = this.battle.choose(player_string, BattleRoom.toChoiceString(action, player_side), this.battle.rqid);

    this.player = 1 - this.player;
};

PokemonBattle.prototype.isReadyForPlay = function(){
    let numberOfActionsRequired = 0;
    if (!this.battle.p1.request.wait) numberOfActionsRequired++;
    if (!this.battle.p2.request.wait) numberOfActionsRequired++;
    return this.choices.length >= numberOfActionsRequired 
}

PokemonBattle.prototype.playTurn = function(copyNeeded){
    if(copyNeeded) this.battle = cloneBattleState(this.battle)

    while(this.choices.length){
        let choice = this.choices.pop()
        if(!choice.choiceString) choice.choiceString = "";
        let choiceSuccess = this.battle.choose(choice.player, choice.choiceString);

        if(!choiceSuccess){
            debugger;
            this.battle[choice.player].clearChoice();
            this.battle.makeRequest();
            decisionPropCalcer.getRequestOptions(this.battle, choice.player);
            this.battle.choose(choice.player, choice.choiceString, this.battle.rqid);
    
            throw new Error(this.battle[choice.player].choice.error);
        }
    }

    this.player = 0;
}

// Check for a winner
PokemonBattle.prototype.getWinner = function () {
    var playerAlive = _.some(this.battle.p1.pokemon, function (pokemon) { return pokemon.hp > 0; });
    var opponentAlive = _.some(this.battle.p2.pokemon, function (pokemon) { return pokemon.hp > 0; }) || this.battle.p2.pokemon.length < 6;
    if (!playerAlive || !opponentAlive) {
        return playerAlive ? 0 : 1;
    }
    return undefined;
};


PokemonBattle.prototype.heuristic = function () {
    if (this.getWinner() !== undefined){
        return this.getWinner() === 0 ? 1000 : -1000;
    }

    //let teamSimulator = teamSimulatorPool.get(this.battle.id);
    //return decisionPropCalcer.evaluate(this.battle, this.battle.format, teamSimulator.dexData, teamSimulator.dex, teamSimulator.moveDex)

    /*let numTries = 0;
    let err = undefined;
    let maxTurns = 150;
    while(numTries < 5){
        try{
            this.battle = cloneBattleState(this.battle);
            while(this.getWinner() === undefined){
                if(this.battle.p1.pokemon.length > 6 || this.battle.p2.pokemon.length > 6) debugger;
                while(!this.isReadyForPlay()){
                    this.performMove(decisionPropCalcer.randomChoice(this.getPossibleMoves()).decision)
                }
                this.playTurn(false)
                if(this.battle.turn >= maxTurns) throw new Error("Max turns reached")
            }
            return this.getWinner() === 0 ? 1000 : -1000;
        } catch(e){
            debugger;
            err = e;
            numTries++;
        }
    }
    throw err;*/

    // Aidan's Heuristic
    var p1_health = _.sum(_.map(this.battle.p1.pokemon, function (pokemon) {
        return !!pokemon.hp ? pokemon.hp / pokemon.maxhp * 100.0 : 0.0;
    }));
    var p2_health = _.sum(_.map(this.battle.p2.pokemon, function (pokemon) {
        return !!pokemon.hp ? pokemon.hp / pokemon.maxhp * 100.0 : 0.0;
    }));
    
    return p1_health - p2_health;
    
    // Use minimax heuristic
    //return minimaxbot.eval(this.battle);
}