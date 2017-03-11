'use strict'

// Logging
var log4js = require('log4js');
var logger = require('log4js').getLogger("mcts");
var learnlog = require('log4js').getLogger("learning");

var program = require('commander'); // Program settings
var fs = require('fs');

var _ = require('lodash');
var BattleRoom = require("./../battleroom");

var randombot = require("./randombot");
var greedybot = require("./greedybot");
var minimaxbot = require("./minimaxbot");

var clone = require("./../clone");

// Function that decides which move to perform
var overallMinNode = {};
var lastMove = '';
var decide = module.exports.decide = function (battle, choices) {
    var startTime = new Date();

    logger.info("Starting move selection ");

    var mcts = new MCTS(new PokemonBattle(battle), 200, 0);
    var action = mcts.selectMove();
    if (action === undefined) {
        action = randombot.decide(battle, choices);
        logger.info("Given choices: " + JSON.stringify(choices) + ", randomly selected action");
    }
    
    logger.info("My action: " + action.type + " " + action.id);
    lastMove = action.id;
    var endTime = new Date();

    logger.info("Decision took: " + (endTime - startTime) / 1000 + " seconds");
    return {
        type: action.type,
        id: action.id
    };
}

// ---- MCTS ALGORITHM
// ------------------------------------------------------------


class Node {
    
    /** Apply the move assigned to this node */
    constructor(game, parent, move, depth, mcts) {
        var self = this
        this.game = game
        this.mcts = mcts
        this.parent = parent
        this.move = move
        this.children = []
        
        this.depth = depth || 0

        this.q = 0
        this.visits = 0

        // Perform the move
        if(move !== null)
        {
            this.game.performMove(this.move)
        }

        // Get current player, which refers to the player who's turn it is to move
        this.untried_actions = _(this.game.getPossibleMoves(this.game.current_player)).shuffle()
    }

    /** Get UCB1 upper bound on the utility of this node. */
    get_UCB1() {
        return (this.wins / this.visits) + Math.sqrt(2 * Math.log(this.parent.visits) / this.visits)
    }

    get_child(move) {
        var gameclone = clone(this.game);
        //_.assign(new this.game.constructor(), _.cloneDeep(this.game))
        var child = new Node(gameclone, this, move, this.depth + 1, this.mcts)
        this.children.push(child)
        return child
    }

    /** Expands a node with untried moves.
     * Select a random move from the set of untried actions. */
    expand() {
        var action = this.untried_actions.pop()
        if (action === undefined) {
            return undefined
        }
        return this.get_child(action)
    }

    /** Checks if all this node's actions have been tried */
    expanded() {
        return this.untried_actions.length == 0
    }

    get_winner() {
        return this.game.getWinner()
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
     */    
    constructor(game, rounds, player) {
        var self = this
        this.game = game

        // Specifies how nodes are explored
        this.c = 1.41       // Exploration constant
        this.tree_policy = function (node) {
            // We explore nodes by UCB1
            if (node.parent.game.getCurrentPlayer() === self.player) {
                return self.c*node.getUCB1()
            }
            // Opposing player explores least explored node
            return -node.visits
        }

        this.rounds = rounds || 1000
        this.player = player

        // Create a new root node
        this.rootNode = new Node(game, null, null, 0, this)
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
                return undefined
            }
            
            // Rollout to maximum depth k, or terminus
            var k = 10
            var d0 = node.depth
            while (node !== undefined && node.depth - d0 < k && node.get_winner() === undefined) {
                node = node.expand()
            }

            // Something went wrong, bail
            if (node === undefined)
            {
                return undefined
            }

            // Get the score of the node
            var winner = node.get_winner()
            var reward
            if (winner !== undefined)
            {
                reward = (this.player === node.getWinner()) ? Math.pow(10,7) : -Math.pow(10,7)
            }
            else {
                reward = this.game.heuristic()
            }

            // Roll back up incrementing the visit counts and propagating score
            while (node.parent) {
                node.visits += 1
                node.q = ((node.visits - 1)/node.visits) * node.q + 1/node.visits * reward
                node = node.parent
            }
            
        }

        // Get the move with the highest visit count
        return _(this.rootNode.children).sortBy('q').last().move
    }

    /** Gets the next node to be expanded.
     * recurses down to the next unexpanded node or terminal state */
    get_next_node(node) {
        while(node.get_winner() === undefined) {
            if (node.expanded()) {
                node = this.best_child(node)
            }
            else {
                return node.expand()
            }
        }
        return node
    }

    /** Select a move according to the tree policy. */
    best_child(node) {
        return _(node.children).shuffle().sortBy(this.tree_policy).last()
    }
}

// ---- POKEMON GAME
// ------------------------------------------------------------

function PokemonBattle(battle) {
    this.battle = battle;
    this.battle.start();

    this.player = 0;
}

PokemonBattle.prototype.getPossibleMoves = function () {
    var current_player = this.player === 0 ? this.battle.p1 : this.battle.p2;
    if (current_player.request.wait)
    {
        return [null,]
    }
    var choices = BattleRoom.parseRequest(current_player.request).choices;
    return choices;
};

PokemonBattle.prototype.getCurrentPlayer = function () {
    return this.player;
};

PokemonBattle.prototype.performMove = function (action) {
    if (this.player === 0) {
        this.battle.choose('p1', BattleRoom.toChoiceString(action, this.battle.p1), this.battle.rqid);
    }
    else if (this.player === 1) {        
        this.battle.choose('p2', BattleRoom.toChoiceString(action, this.battle.p2), this.battle.rqid);
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
    return minimaxbot.eval(this.battle);
}