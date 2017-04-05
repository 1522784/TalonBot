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
var minimaxbot = require("./minimaxbot");

var clone = require("./../clone");

// ---- MCTS ALGORITHM
// ------------------------------------------------------------

// Reduced gamestate for identifying children for re-use
class State {
    constructor(battle) {
        var sides =  [battle.p1, battle.p2]
        var active = _.map(sides, function(s){
            return _.find(s.pokemon, function(p){return p.position === 0})
        })

        this.names = _.map(active, 'name')
        this.fnt = _.map(active, function(p){return p.hp == 0})
        this.statusData = _.map(active, 'statusData.id')
    }
}

class Node {
    
    /** Apply the move assigned to this node */
    constructor(parent, moves, depth, p1_choices, p2_choices) {
        var self = this
        this.parent = parent
        
        this.children = []
        
        this.depth = depth || 0

        this.q = 0
        this.visits = 0

        this.moves = moves
        this.choices = [p1_choices, p2_choices]
        
        // Used to identify this child
        this.state = {'moves':moves, }

        this.untried_actions = [_(p1_choices).castArray(), _(p2_choices).castArray()]

        // Stores the aggregate UCB1 rewards of each move for each player
        this.reward_maps = [[],[]]
    }

    get_child(moves, p1_choices, p2_choices) {
        var child = new Node(this, moves, this.depth + 1, p1_choices, p2_choices)
        this.children.push(child)
        return child
    }

    /** Checks if all this node's actions for a given player have been tried */
    expanded() {
        return _.size(this.untried_actions[0]) === 0 && _.size(this.untried_actions[1]) === 0
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


/** Get UCB1 upper bound on the utility of this node. */
function UCB1(q, n, N, c) {
    return q + c*Math.sqrt(Math.log(N / n))
}

// ---- MCTS
// ------------------------------------------------------------

class MCTS {
    /**
     * Creates an MCTS search object. One of these will be constructed BattleRoom
     * the start of each of the AI player's turns.
     * TODO: Caching?
     * 
     * @constructor     
     * @param {int} rounds - How many rounds to play out
     * @param {int} cutoff_depth - The depth at which to cut off simulation and perform heuristic evaluation
     * @param {int} player - The AI player, either 0 or 1 corresponding to p1 or p2.
     */    
    constructor(rounds, cutoff_depth, bot_player) {        
        this.turn = 0

        // Specifies how nodes are explored
        var c = 20.0     // Exploration constant
        this.tree_policy = function (node, player) {
            if (node.untried_actions[player].size() !== 0)
            {
                var action = node.untried_actions[player].sample()
                if (action === undefined) {
                    return undefined
                }
                
                node.untried_actions[player] = node.untried_actions[player].differenceBy([action,], 'id');
                
                node.reward_maps[player].push({'move':action, 'q':0, 'n':0})
                return action
            }
            else
            {
                // DUCT-max
                var move_reward = _.maxBy(node.reward_maps[player], function(o) {
                    return UCB1(o.q, o.n, node.visits, c)
                })
                if (move_reward === undefined)
                {
                    return undefined
                }
                return move_reward.move;
            }
        }

        this.rounds = rounds || 1000
        this.cutoff_depth = cutoff_depth
        this.bot_player = bot_player
    }

    initTurn(game, p1_choices, p2_choices) {
        this.game = game

        // Create a new root node for now
        p1_choices = !!p1_choices ? p1_choices : game.getPossibleMoves(0)
        p2_choices = !!p2_choices ? p2_choices : game.getPossibleMoves(1)

        this.rootNode = new Node(null, null, 0, p1_choices, p2_choices)

        var root_state = new State(game.battle)
        console.log(JSON.stringify(root_state))
        
        // if(!this.rootNode)
        // {
        //     this.rootNode = new Node(null, null, 0, p1_choices, p2_choices)
        // }
        // else
        // {
        //     var child = _.find(this.rootNode.children, function(c) {
        //         return _.isEqual(c.moves, moves) && _.isEqual(c.p1_choices, choices[0]) && _.isEqual(c.p1_choices, choices[1])
        //     });
        // }

        this.turn++
    }

    /** Select the move that should be performed by the player this turn */
    selectMove() {
        var round, node, game, result
        for (round = 0; round < this.rounds; round += 1) {

            // ---- MCTS Algorithm
            
            // Explore down to the bottom of the known tree via UCB1, and add node
            result = this.get_next_node(this.rootNode, clone(this.game))
            node = result.node
            game = result.game
            
            // Rollout to maximum depth k, or terminus
            var winner = game.getWinner()
            var d
            for (d = node.depth; d < this.cutoff_depth; d++) {
                // Check win condition
                if (game.getWinner() !== undefined)
                {
                    break;
                }

                // TODO: Sample according to heuristic?
                // Sample moves randomly
                var moves = _.map([0,1], function(p){return _.sample(game.getPossibleMoves(p))})

                // Perform moves
                if (moves !== null)
                {
                    game.performTurn(moves)
                }
            }
            
            // Get the score of the node
            var rewards = [0,0]
            if (winner !== undefined)
            {
                var score = (this.bot_player === winner) ? Math.pow(10,7) : -Math.pow(10,7)
                rewards = [score, -score]
            }
            else {
                var score = game.heuristic()
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
                        var ns = _.find(node.reward_maps[i], function(s) {return _.isEqual(s.move, moves[i]);});
                        ns.n += 1
                        ns.q = ((ns.n - 1.0)/ns.n) * ns.q + 1.0/ns.n * rewards[i]
                    }
                }
            }
        }

        // Tracking
        var N = this.rootNode.visits
        var c = 10.0
        logger.info("p1 scores:")
        _.each(this.rootNode.reward_maps[0].sort(function(a,b){
            if(a.n === b.n)
            {
                return b.q - a.q
            }
            return b.n - a.n
        }), function(elem){logger.info(JSON.stringify(elem.move) + " " + elem.n + " " + elem.q)});

        logger.info("p2 scores:")
        _.each(this.rootNode.reward_maps[1].sort(function(a,b){
            if(a.n === b.n)
            {
                return b.q - a.q
            }
            return b.n - a.n
        }), function(elem){logger.info(JSON.stringify(elem.move) + " " + elem.n + " " + elem.q)});
        
        
        
        var move_reward = _.maxBy(this.rootNode.reward_maps[0], function(o) { return o.n; })
        if (move_reward === undefined)
        {
            return undefined
        }
        return move_reward.move;
    }

    /** Gets the next node to be expanded.
     * recurses down to the next unexpanded node or terminal state */
    get_next_node(node, game) {

        var child, moves, choices
        while(game.getWinner() === undefined) {
            
            // Increment visits count
            node.visits += 1
            
            moves = this.get_actions(node)
            game.performTurn(moves)
            choices = [game.getPossibleMoves(0), game.getPossibleMoves(1)]

            child = _.find(node.children, function(c) {
                return _.isEqual(c.moves, moves) && _.isEqual(c.choices, choices)
            });
            
            if(!!child)
            {
                node = child;
            }
            else {
                node = this.expand(node, moves, choices)                
                break
            }
        }
        return {'node':node, 'game':game}
    }

    /** Select moves according to the tree policy. */
    get_actions(node) {
        var self = this;
        var moves = _.map([0,1], function(player) {
            return self.tree_policy(node, player)
        })
        return moves
    }

    /** Expand a node*/
    expand(node, moves, choices) {
        return node.get_child(moves, choices[0], choices[1])
    }
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
    var choices = BattleRoom.parseRequest(current_player.request).choices.sort();
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
    var p1_health = _.sum(_.map(this.battle.p1.pokemon, function (pokemon) {
        return !!pokemon.hp ? pokemon.hp / pokemon.maxhp * 100.0 : 0.0;
    }));
    var p2_health = _.sum(_.map(this.battle.p2.pokemon, function (pokemon) {
        return !!pokemon.hp ? pokemon.hp / pokemon.maxhp * 100.0 : 0.0;
    }));
    
    return (p1_health - p2_health);
    
    // Use minimax heuristic
    // return minimaxbot.eval(this.battle);
}

// Function that decides which move to perform
var overallMinNode = {};
var lastMove = '';
var mcts = new MCTS(200, 6, 0)
var decide = module.exports.decide = function (battle, choices) {
    var startTime = new Date();

    logger.info("Starting move selection");
    logger.info("Given choices: " + JSON.stringify(choices));

    mcts.initTurn(new PokemonBattle(battle), choices, null)
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