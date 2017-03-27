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
    logger.info("Given choices: " + JSON.stringify(choices));

    var mcts = new MCTS(new PokemonBattle(battle), 150, 5, 0, choices);
    var action = mcts.selectMove();
    if (action === undefined) {
        action = randombot.decide(battle, choices);
        logger.info("Randomly selected action");
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
    constructor(game, parent, moves, depth, mcts, p1_choices) {
        var self = this
        this.game = game
        this.mcts = mcts
        this.parent = parent
        
        this.children = []
        
        this.depth = depth || 0

        this.q = 0
        this.visits = 0

        // Perform the chosen moves (p1 and p2)
        this.moves = moves
        if (moves !== null)
        {
            this.game.performTurn(this.moves)
        }

        // Possible moves for this node
        if(!p1_choices) p1_choices = this.game.getPossibleMoves(0)
        // console.log(this.game.battle.p1.pokemon[0].name  + " " + this.game.battle.p1.pokemon[0].hp)
        // console.log(p1_choices)

        var p2_choices = this.game.getPossibleMoves(1)
        // console.log(this.game.battle.p2.pokemon[0].name + " " + this.game.battle.p2.pokemon[0].hp)
        // console.log(p2_choices)
        this.untried_actions = [_(p1_choices).castArray(), _(p2_choices).castArray()]

        // Stores the aggregate UCB1 rewards of each move for each player
        this.reward_maps = [];

        this.reward_maps.push(_.map(p1_choices, function(move){
            return {'move':move, 'q':0, 'n':0}
        }))
        this.reward_maps.push(_.map(p2_choices, function(move){
            return {'move':move, 'q':0, 'n':0}
        }))
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

    /** Checks if all this node's actions for a given player have been tried */
    expanded() {
        return _.size(this.untried_actions[0]) === 0 && _.size(this.untried_actions[1]) === 0
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
    constructor(game, rounds, cutoff_depth, player, choices) {
        var self = this
        this.game = game

        // Specifies how nodes are explored
        this.c = 1.41       // Exploration constant
        this.tree_policy = function (node, player) {
            if (node.untried_actions[player].size() !== 0)
            {
                var action = node.untried_actions[player].sample()
                if (action === undefined) {
                    return undefined
                }
                node.untried_actions[player] = node.untried_actions[player].pull(action)
                return action
            }
            else
            {
                // DUCT-max
                var move_reward = _.maxBy(node.reward_maps[player], function(o) { return o.q; })
                if (move_reward === undefined)
                {
                    return undefined
                }
                return move_reward.move;
            }
        }

        this.rounds = rounds || 1000
        this.cutoff_depth = cutoff_depth
        this.player = player

        // Create a new root node
        this.rootNode = new Node(game, null, null, 0, this, choices)
    }

    /** Select the move that should be performed by the player this turn */
    selectMove() {
        var round, node
        for (round = 0; round < this.rounds; round += 1) {

            // ---- MCTS Algorithm
            
            // Explore down to the bottom of the known tree via UCB1
            node = this.get_next_node(this.rootNode)
            
            // Rollout to maximum depth k, or terminus            
            var d0 = node.depth
            while (node !== undefined && node.depth - d0 < this.cutoff_depth && node.get_winner() === undefined) {
                node = this.expand(node)
            }

            // Get the score of the node
            var winner = node.get_winner()
            var rewards = [0,0]
            if (winner !== undefined)
            {
                var score = (this.player === winner) ? Math.pow(10,7) : -Math.pow(10,7)
                rewards = [score, -score]
            }
            else {
                var score = node.game.heuristic()
                rewards = [score, -score]
            }

            // Roll back up incrementing the visit counts and propagating score by move
            var moves
            while (node.parent) {
                moves = node.moves
                node = node.parent

                for (var i = 0; i<2; i++)
                {
                    // If this is a move where an action was not required, don't update
                    if (moves[i] !== undefined && _.size(node.reward_maps[i]) !== 0) {
                        var ns = _.find(node.reward_maps[i], function(s) { return s.move.id === moves[i].id;});
                        ns.n += 1
                        ns.q = ((ns.n - 1.0)/ns.n) * ns.q + 1.0/ns.n * rewards[i]
                    }
                }
            }
        }

        if (this.rootNode.children.length > 0)
        {
            var action_string = JSON.stringify(this.rootNode.reward_maps[0])
            logger.info("Action scores: " + action_string);
        }
        else
        {
            logger.info("No children");
        }
        
        var move_reward = _.maxBy(this.rootNode.reward_maps[0], function(o) { return o.n; })
        if (move_reward === undefined)
        {
            return undefined
        }
        return move_reward.move;
    }

    /** Gets the next node to be expanded.
     * recurses down to the next unexpanded node or terminal state */
    get_next_node(node) {
        while(node.get_winner() === undefined) {
            if (node.expanded()) {
                node = this.get_successor(node)
            }
            else {
                return this.expand(node)
            }
        }
        return node
    }

    /** Select a move according to the tree policy. */
    get_successor(node) {
        var self = this;
        var moves = _.map([0,1], function(player) {
            return self.tree_policy(node, player)
        })
        return _.find(node.children, function(c) { return c.moves === moves; });
    }

    /** Expand a node according to the tree policy. */
    expand(node) {
        var self = this;
        var moves = _.map([0,1], function(player) {
            return  self.tree_policy(node, player)
        })
        return node.get_child(moves)
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
        return []
    }
    var choices = BattleRoom.parseRequest(current_player.request).choices;
    return choices
};

PokemonBattle.prototype.performTurn = function (actions) {
    if(actions[0] !== undefined)
    {
        this.battle.choose('p1', BattleRoom.toChoiceString(actions[0], this.battle.p1), this.battle.rqid);
    }
    else
    {
        this.battle.p1.decision = true;
    }

    if(actions[1] !== undefined)
    {
        this.battle.choose('p2', BattleRoom.toChoiceString(actions[1], this.battle.p2), this.battle.rqid);
    }
    else
    {
        this.battle.p2.decision = true;
    }
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
    //     return pokemon.hp ? pokemon.hp : 0;
    // }));
    // var p2_health = _.sum(_.map(this.battle.p2.pokemon, function (pokemon) {
    //     return pokemon.hp ? pokemon.hp : 0;
    // }));
    // return p1_health - p2_health;
    
    // Use minimax heuristic
    return minimaxbot.eval(this.battle);
}