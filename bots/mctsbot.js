'use strict'

// Logging
var log4js = require('log4js');
var logger = require('log4js').getLogger("minimax");
var learnlog = require('log4js').getLogger("learning");

var program = require('commander'); // Program settings
var fs = require('fs');

var _ = require('lodash');
var BattleRoom = require("./../battleroom");

var randombot = require("./randombot");
var greedybot = require("./greedybot");
var minmaxbot = require("./minimaxbot");

var clone = require("./../clone");

// ---- MCTS ALGORITHM
// ------------------------------------------------------------

function RandomSelection(array) {
    this.array = array
}

/** Constructor for node */
class Node {
    constructor(game, parent, move, player, depth, mcts) {
        this.game = game
        this.mcts = mcts
        this.parent = parent
        this.move = move
        this.player = player
        this.wins = 0
        this.visits = 0
        this.children = null
        this.depth = depth || 0
        this.randomNode = false
    }

    /** Get UCB1 upper bound on the utility of this node. */
    getUCB1() {
        return (this.wins / this.visits) + Math.sqrt(2 * Math.log(this.parent.visits) / this.visits)
    }

    /** Apply the move assigned to this node, then return possible moves for this node.
     */
    getChildren() {
        if (this.children === null) {

            // Perform the move
            if (this.move !== null) {
                this.game.performMove(this.player, this.move)
            }

            // Get current player refers to the player who's turn it is to move
            var next_player = this.game.getCurrentPlayer();
            var moves = this.game.getPossibleMoves(next_player)
            if (moves instanceof RandomSelection) {
                moves = moves.array
                this.randomNode = true
            }

            this.children = _.map(moves, function (move) {
                return new Node(_.assign(new this.game.constructor(), _.cloneDeep(this.game)), this, move, next_player, this.depth + 1, this.mcts)
            }, this)
        }
        return this.children
    }

    getWinner() {
        // forces the move to be performed
        this.getChildren()
        return this.game.getWinner()
    }


    /** Gets the next move for this node, by UCB1 if we're in the search portion
     * or randomly if we're in the playout portion.
     * 
     * TODO: Make playouts smarter, using some sort of heuristic evaluation.
     */
    nextMove() {
        // shuffle because sortBy is a stable sort but we want equal nodes to be chosen randomly
        if (this.randomNode) {
            return _(this.getChildren()).shuffle().last()
        }

        // Return the best node by the MCTS heuristic
        return _(this.getChildren()).shuffle().sortBy(this.mcts.nodeSort).last()
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
        this.nodeSort = function (node) {
            // We explore nodes by UCB1
            if (node.parent.game.getCurrentPlayer() === self.player) {
                return node.getUCB1()
            }
            // Opposing player explores least explored node
            return -node.visits
        }
        this.rounds = rounds || 1000
        this.player = player

        // Create a new root node
        this.rootNode = new Node(game, null, null, this.player, 0, this)
    }

    /** Select the move that should be performed by the player this turn */
    selectMove() {
        var round, currentNode
        for (round = 0; round < this.rounds; round += 1) {
            currentNode = this.rootNode
            this.rootNode.visits += 1            

            // ---- MCTS Algorithm
            // TODO: verify that this implementation is correct, I'm currently
            // unsure of how it transitions from guided exploration to random 
            // playouts.
            
            // Explore down to the bottom of the known tree via UCB1, then
            // rollout to the bottom of the search space.
            while (!_.isEmpty(currentNode.getChildren())) {
                currentNode = currentNode.nextMove()
                currentNode.visits += 1
            }

            // Roll back up incrementing the win counts for each node
            if (this.player === currentNode.getWinner()) {
                while (currentNode.parent) {
                    currentNode.wins += 1
                    currentNode = currentNode.parent
                }
            }
        }

        // Get the move with the highest visit count        
        return _(this.rootNode.getChildren()).sortBy('visits').last().move
    }
}

exports.MCTS = MCTS
exports.RandomSelection = RandomSelection

// ---- POKEMON GAME
// ------------------------------------------------------------

function PokemonBattle(battle) {
    this.battle = battle;
    this.battle.start();
}

PokemonBattle.prototype.getPossibleMoves = function (player) {
    var current_player = player === 0 ? this.battle.p1 : this.battle.p2;
    var choices = BattleRoom.parseRequest(current_player).choices;
    return choices;
};

PokemonBattle.prototype.getCurrentPlayer = function () {
    return this.battle.p1.decision === false ? 0 : 1;
};

PokemonBattle.prototype.performMove = function (player, action) {
    if (player === 0) {
        this.battle.choose('p1', BattleRoom.toChoiceString(action, this.battle.p1), newbattle.rqid);
    }
    else if (player === 1) {
        this.battle.choose('p2', BattleRoom.toChoiceString(action, this.battle.p2), newbattle.rqid);
    }
};

// Check for a winner
PokemonBattle.prototype.getWinner = function () {
    var playerAlive = _.any(this.battle.p1.pokemon, function (pokemon) { return pokemon.hp > 0; });
    var opponentAlive = _.any(this.battle.p2.pokemon, function (pokemon) { return pokemon.hp > 0; });
    if (!playerAlive || !opponentAlive) {
        return playerAlive ? 0 : 1;
    }
    return undefined;
};