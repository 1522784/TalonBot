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

    logger.info("Starting move selection");

    var mcts = new MCTS(new PokemonBattle(battle), 100, 0, choices);
    var action = mcts.selectMove();
    if (action === undefined) {
        action = randombot.decide(battle, choices);
        logger.info("Randomly selected action");
    }
    
    logger.info("Given choices: " + JSON.stringify(choices));
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
    constructor(game, parent, moves, depth, mcts) {
        var self = this
        this.game = game
        this.mcts = mcts
        this.parent = parent
        
        this.children = []
        
        this.depth = depth || 0

        this.q = 0
        this.visits = 0

        // Perform the move
        this.moves = moves
        if (moves !== null)
        {
            this.game.performTurn(this.moves)
        }

        // Possible moves for this node
        var p1_choices = this.game.getPossibleMoves(0)
        console.log(p1_choices)
        var p2_choices = this.game.getPossibleMoves(1)
        console.log(p2_choices)
        this.untried_actions = _(product(p1_choices, p2_choices)).castArray()

        // Stores the aggregate UCB1 rewards of each move for each player
        this.reward_maps = [];

        this.reward_maps.push(_.map(p1_choices, function(move){
            return {'move':move, 'q':0, 'n':0}
        }))
        this.reward_maps.push(_.map(p2_choices, function(move){
            return {'move':move, 'q':0, 'n':0}
        }))
        
        if (depth === 0)
        {
            logger.info("Root node pairs: " + JSON.stringify(this.untried_actions));
        }
    }

    /** Get UCB1 upper bound on the utility of this node. */
    get_UCB1() {
        return this.q + Math.sqrt(2 * Math.log(this.parent.visits) / this.visits)
    }

    get_child(moves) {
        var gameclone = clone(this.game);
        var child = new Node(gameclone, this, moves, this.depth + 1, this.mcts)
        this.children.push(child)
        return child
    }

    /** Expands a node with untried moves.
     * Select a random move from the set of untried actions. */
    expand() {
        var actions = this.untried_actions.sample()
        if (actions === undefined) {
            return undefined
        }
        this.untried_actions = this.untried_actions.pull(actions)
        return this.get_child(actions)
    }

    /** Checks if all this node's actions have been tried */
    expanded() {
        return this.untried_actions.size() == 0
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
     * @param {Array} choices - Initial choices, handles fainted pokemon, etc...
     */    
    constructor(game, rounds, player, choices) {
        var self = this
        this.game = game

        // Specifies how nodes are explored
        this.c = 1.41       // Exploration constant
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
        this.rootNode = new Node(game, null, null, 0, this)
        // if (choices)
        // {
        //     this.rootNode.untried_actions = _(choices).castArray()
        // }
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
            var k = 5
            var d0 = node.depth
            while (node !== undefined && node.depth - d0 < k && node.get_winner() === undefined) {
                node = node.expand()
            }

            // Something went wrong, bail
            if (node === undefined)
            {
                continue
            }

            // Get the score of the node
            var winner = node.get_winner()
            var rewards = [0,0]
            if (winner !== undefined)
            {
                var score = (this.player === node.getWinner()) ? Math.pow(10,7) : -Math.pow(10,7)
                rewards = [score, -score]
            }
            else {
                var score =node.game.heuristic()
                rewards = [score, -score]
            }

            // Roll back up incrementing the visit counts and propagating score by move
            var moves
            while (node.parent) {
                moves = node.moves
                node = node.parent

                for (var i = 0; i<2; i++)
                {
                    var ns = _.find(node.reward_maps[i], function(s) { return s.move === moves[i];});
                    ns.n += 1
                    ns.q = ((ns.n - 1.0)/ns.n) * ns.q + 1.0/ns.n * rewards[i]
                }
            }
        }

        if (this.rootNode.children.length > 0)
        {
            var action_string = JSON.stringify(node.reward_maps[0])
            logger.info("Action scores: " + action_string);
        }
        else
        {
            logger.info("No children");
        }
        
        // Get the move with the highest visit count
        return this.rootNode.reward_maps.shuffle().sortBy(function(r){return r.q}).last().move
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
        moves = _.map(node.reward_maps, function(rewards){
            return rewards.shuffle().sortBy(function(r){return r.q}).last().move
        })
        return _.find(moves, function(c) { return c.moves === moves; });
    }
}

// ---- UTILS
// ------------------------------------------------------------

function product() {
  var args = Array.prototype.slice.call(arguments); // makes array from arguments
  return args.reduce(function tl (accumulator, value) {
    var tmp = [];
    accumulator.forEach(function (a0) {
      value.forEach(function (a1) {
        tmp.push(a0.concat(a1));
      });
    });
    return tmp;
  }, [[]]);
}

// ---- POKEMON GAME
// ------------------------------------------------------------

function PokemonBattle(battle) {
    this.battle = battle;
    this.battle.start();
}

PokemonBattle.prototype.getPossibleMoves = function (player) {
    var current_player = player === 0 ? this.battle.p1 : this.battle.p2;
    if (current_player.request.wait)
    {
        return [null,]
    }
    var choices = BattleRoom.parseRequest(current_player.request).choices;
    return choices
};

PokemonBattle.prototype.performTurn = function (actions) {    
    this.battle.choose('p1', BattleRoom.toChoiceString(actions[0], this.battle.p1), this.battle.rqid);
    this.battle.choose('p2', BattleRoom.toChoiceString(actions[1], this.battle.p2), this.battle.rqid);
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
    // var p1_health = _.sum(_.map(this.battle.p1.pokemon, function (pokemon) {
    //     return pokemon.hp;
    // }));
    // var p2_health = _.sum(_.map(this.battle.p2.pokemon, function (pokemon) {
    //     return pokemon.hp;
    // }));
    // logger.info(JSON.stringify(p1_health) + " - " + JSON.stringify(p2_health) + " = " +  JSON.stringify(p1_health - p2_health))
    // return p1_health - p2_health;
    
    // Use minimax heuristic
    return minimaxbot.eval(this.battle);
}