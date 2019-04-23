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

var TeamSimulator = require("./teamsimulator")

var teamSimulatorPool = new Map()
var startTime

// Function that decides which move to perform
var overallMinNode = {};
var lastMove = ''; 

var decisionPropCalcer = require("./simpledecisionpropcalcer");

//Decide what option to choose in a battle turn
var decide = module.exports.decide = function (battle, choices) {

    log.info("Starting move selection");

    var mcts = new MCTS(new PokemonBattle(battle), 100, 0, choices, teamSimulatorPool.get(battle.id));
    try{
        var action = mcts.selectMove();
        mcts.destroy();
    }catch(e){
        debugger;
        mcts.selectMove(); 
    }
    
    log.info("Given choices: " + JSON.stringify(choices));
    log.info("My action: " + action.type + " " + action.id);
    lastMove = action.id;

    teamSimulatorPool.get(battle.id).addOwnDecisionToHistory(action);

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
            name: "Caterpie",
            species: "Caterpie",
            moves: ["tackle"],
            ability: "None",
            evs: { hp: 0, atk: 255, def: 0, spa: 255, spd: 255, spe: 255 },
            ivs: { hp: 30, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 },
            item: '',
            level: 100,
            shiny: false
        },
        {
            name: "Magikarp",
            species: "Magikarp",
            moves: ["tackle"],
            ability: "None",
            evs: { hp: 0, atk: 255, def: 0, spa: 255, spd: 255, spe: 255 },
            ivs: { hp: 30, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 },
            item: '',
            level: 100,
            shiny: false
        }
    ]
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
            this.game.performMove(this.move)
        }

        // Moves for the current player
        this.untried_actions = this.game.getPossibleMoves(this.game.current_player);
    }

    /** Get UCB1 upper bound on the utility of this node. */
    get_UCB1() {
        return this.q + Math.sqrt(2 * Math.log(this.parent.visits) / this.visits)
    }

    get_child(move) {
        var gameclone = new PokemonBattle(cloneBattleState(this.game.battle));
        gameclone.player = this.game.player;
        //_.assign(new this.game.constructor(), _.cloneDeep(this.game))
        try{
            var child = new Node(gameclone, this, move, this.depth + 1, this.mcts)
        }
        catch(e){
            var player_side = this.game.player === 0 ? this.game.battle.p1 : this.game.battle.p2
            throw new Error("Creating a new Child caused an error.\nParent depth: " + this.depth + "\nOptions" + this.untried_actions.concat({decision: move}).map(option => JSON.stringify(option.decision)) + "\nRequest: " + JSON.stringify(player_side.request) + "\nCaused by Error: " + e.stack)
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
        return this.children.size < this.maxChildren;
    }

    get_winner() {
        return this.game.getWinner()
    }

    destroy(){
        this.game.destroy();
        for(let child of this.children)
            child.destroy();
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
        var gameclone = new PokemonBattle(cloneBattleState(this.game.battle));
        gameclone.player = this.game.player;

        //_.assign(new this.game.constructor(), _.cloneDeep(this.game))
        try{
        var child = new BeforeTeamSelectedNode(gameclone, this, move, this.depth + 1, this.mcts, this.teamSimulator, this.maxChildren);
        }
        catch(e){
            var player_side = this.game.player === 0 ? this.game.battle.p1 : this.game.battle.p2
            throw new Error("Creating a new Child caused an error.\nParent depth: " + this.depth + "\nOptions" + this.untried_actions.concat({decision: move}).map(option => option.decision.action + " " + option.decision.id) + "\nRequest: " + JSON.stringify(player_side.request) + "\nCaused by Error: " + e.stack)
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
        return this.untried_actions.size() === 0;
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
        this.rootNode = new CurrentChoiceNode(game, null, null, 0, this, teamSimulator, 20)
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
            var k = 6
            while (node !== undefined && node.depth < k && node.get_winner() === undefined) {
                node = node.expand()
            }

            // Something went wrong, bail
            if (node === undefined)
            {
                continue
            }

            // Get the score of the node
            var winner = node.get_winner()
            var reward
            if (winner !== undefined)
            {
                reward = (this.player === node.get_winner()) ? Math.pow(10,7) : -Math.pow(10,7)
            }
            else {
                reward = node.game.heuristic()
            }

            // Roll back up incrementing the visit counts and propagating score
            while (node) {
                node.visits += 1
                node.q = ((node.visits - 1)/node.visits) * node.q + 1/node.visits * reward
                node = node.parent
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
        
        // Get the move with the highest visit count
        return _(this.rootNode.children).maxBy('visits').move
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
        return _(node.children).maxBy(this.tree_policy)
    }
}

// ---- POKEMON GAME
// ------------------------------------------------------------

function PokemonBattle(battle) {
    this.battle = battle;

    this.player = 0;
}

PokemonBattle.prototype.getPossibleMoves = function () {
    var current_player = this.player === 0 ? this.battle.p1 : this.battle.p2;

    this.battle.makeRequest();

    if (current_player.request.wait)
    {
        return [{decision: null, probability: 1},]
    }

    return decisionPropCalcer.getRequestOptions(current_player.request);
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

    //Stupid workaround. For some reason this method returns 1 when switching in to a fainted Pokemon. Therefore we overwrite it
    //let getChoiceIndexBackup = player_side.getChoiceIndex;
    //player_side.getChoiceIndex = () => 0;

    let choiceSuccess = this.battle.choose(player_string, BattleRoom.toChoiceString(action, player_side), this.battle.rqid);
    
    //player_side.getChoiceIndex = getChoiceIndexBackup;

    if(!choiceSuccess){
        debugger;
        this.battle.makeRequest();
        this.battle.choose(player_string, BattleRoom.toChoiceString(action, player_side), this.battle.rqid);
        log.error(player_string);
        log.error(player_side.choice);
        log.error(action)
        let err = player_side.choice.error;
        player_side.emitChoiceError = (message) => log.error(message);
        this.battle.choose(player_string, BattleRoom.toChoiceString(action, player_side), this.battle.rqid);

        throw new Error(err);
    }

    this.player = 1 - this.player;
};

// Check for a winner
PokemonBattle.prototype.getWinner = function () {
    var playerAlive = _.some(this.battle.p1.pokemon, function (pokemon) { return pokemon.hp > 0; });
    var opponentAlive = _.some(this.battle.p2.pokemon, function (pokemon) { return pokemon.hp > 0; });
    if (!playerAlive || !opponentAlive) {
        return playerAlive ? 0 : 1;
    }
    return undefined;
};


PokemonBattle.prototype.heuristic = function () {
    // Aidan's Heuristic
    var p1_health = _.sum(_.map(this.battle.p1.pokemon, function (pokemon) {
        return !!pokemon.hp ? pokemon.hp / pokemon.maxhp * 100.0 : 0.0;
    }));
    var p2_health = _.sum(_.map(this.battle.p2.pokemon, function (pokemon) {
        return !!pokemon.hp ? pokemon.hp / pokemon.maxhp * 100.0 : 0.0;
    }));
    
    return (p1_health - p2_health) + 600;
    
    // Use minimax heuristic
    //return minimaxbot.eval(this.battle);
}