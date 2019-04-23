'use strict'

// Logging
var log4js = require('log4js');
var log = require('log4js').getLogger("mcts");
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

// Reduced gamestate representation
class State {
    constructor(battle) {
        var sides =  [battle.p1, battle.p2]
        var active = _.map(sides, function(s){
            return _.find(s.pokemon, function(p){return p.position === 0})
        })

        this.names = _.map(active, 'name')
        this.items = _.map(active, 'item')
        this.fnt = _.map(active, function(p){return p.hp == 0})
        this.statusData = _.map(active, 'statusData.id')
    }
}

class Node {
    
    /** Apply the move assigned to this node */
    constructor(parent, moves, depth, p1_choices, p2_choices, state) {
        var self = this
        this.parent = parent
        
        this.children = []
        
        this.depth = depth || 0

        this.q = 0
        this.visits = [0,0]

        this.moves = moves
        this.choices = [p1_choices, p2_choices]
        
        // Used to identify this child
        this.state = state

        this.untried_actions = [_(p1_choices).castArray(), _(p2_choices).castArray()]

        // Stores the aggregate UCB1 rewards of each move for each player
        this.reward_maps = [[],[]]
    }

    get_child(moves, p1_choices, p2_choices, state) {
        var child = new Node(this, moves, this.depth + 1, p1_choices, p2_choices, state)
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

/** Sample from elements 'elems' according to function g which maps elements to un-normalized probabilities */
function sample_from(elems, g) {
    var cumulative = 0;
    var sum_pairs = _.map(elems, function(elem){
        cumulative += g(elem);
        return [cumulative, elem];
    });

    var rand = Math.random()*cumulative
    var result = _.find(sum_pairs, function(item){return item[0] >= rand})    
    return result[1]
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
        this.inertia = 0.2      // Used to turn the rewards for a switch

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
                var move_reward = _.maxBy(node.reward_maps[player], function(o) {
                    return UCB1(o.q, o.n, node.visits[player], c)
                })
                
                if (move_reward === undefined)
                {   
                    return undefined
                }                
                return move_reward.move;
            }
        }

        this.move_policy = function (reward_map) {
            // DUCT-max
            var move_reward = _.maxBy(reward_map, function(o) { return o.n; })
            
            // DUCT-mix
            // var move_reward = sample_from(reward_map, function(o) {
            //     return o.n
            // });
            return move_reward
        }

        this.rounds = rounds || 1000
        this.cutoff_depth = cutoff_depth
        this.bot_player = bot_player
    }

    initTurn(game, p1_choices, p2_choices) {
        this.game = game

        var root_state = new State(game.battle)
        
        p1_choices = !!p1_choices ? p1_choices : game.getPossibleMoves(0)
        
        // The human player does not get to move if we've fainted, and they haven't
        if(root_state.fnt[0] && !root_state.fnt[1]) {
            p2_choices = []
        }
        p2_choices = !!p2_choices ? p2_choices : game.getPossibleMoves(1)
        
        // Create a new root node for now
        this.rootNode = new Node(null, null, 0, p1_choices, p2_choices)

        this.turn++
    }

    /** Select the move that should be performed by the player this turn */
    selectMove() {
        var self = this
        var round, node, game, result
        for (round = 0; round < this.rounds; round += 1) {

            // ---- MCTS Algorithm
            var player, side
            for(player = 0; player < 2; player++) {

                var game_copy = clone(this.game)
                
                // Determinize
                var sides = [game_copy.battle.p1, game_copy.battle.p2]
                for(side = 1-player; side < 2; side++) {
                    this.determinize(sides[side])
                }
                
                // Explore down to the bottom of the known tree via UCB1, and add node
                result = this.get_next_node(this.rootNode, game_copy, player)
                node = result.node
                game = result.game
                
                // Rollout to maximum depth k, or terminus
                var winner = game.getWinner()
                var d
                for (d = node.depth; d < this.cutoff_depth; d++) {
                    // Check win condition
                    if (winner !== undefined)
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
                winner = game.getWinner()
                
                // Get the score of the node from the point of view of the current player
                var reward = 0
                if (winner !== undefined)
                {
                    var score = (this.bot_player === winner) ? Math.pow(10,7) : -Math.pow(10,7)
                    reward = player==0 ? score : -score
                }
                else {
                    var score = game.heuristic()
                    reward = player==0 ? score : -score
                }

                // Roll back up incrementing the visit counts and propagating score by move
                var moves
                while (node.parent) {
                    moves = node.moves
                    node = node.parent
                    
                    // If this is a move where an action was not required, don't update
                    if (moves[player] !== undefined && _.size(node.reward_maps[player]) !== 0) {
                        var ns = _.find(node.reward_maps[player], function(s) {return _.isEqual(s.move, moves[player]);});
                        ns.n += 1
                        ns.q = ((ns.n - 1.0)/ns.n) * ns.q + 1.0/ns.n * reward
                    }
                }
            }
        }

        // Tracking        
        log.info("p1 scores:")
        _.each(this.rootNode.reward_maps[0].sort(function(a,b){
            if(a.n === b.n)
            {
                return b.q - a.q
            }
            return b.n - a.n
        }), function(elem){log.info(JSON.stringify(elem.move) + " " + elem.n + " " + elem.q)});

        log.info("p2 scores:")
        _.each(this.rootNode.reward_maps[1].sort(function(a,b){
            if(a.n === b.n)
            {
                return b.q - a.q
            }
            return b.n - a.n
        }), function(elem){log.info(JSON.stringify(elem.move) + " " + elem.n + " " + elem.q)});
        
        
        // Select final move to make
        var move_reward = this.move_policy(this.rootNode.reward_maps[0])
        if (move_reward === undefined)
        {
            return undefined
        }
        return move_reward.move;
    }

    /** Gets the next node to be expanded.
     * recurses down to the next unexpanded node or terminal state */
    get_next_node(node, game, player) {

        var child, moves, choices, state
        while(game.getWinner() === undefined) {
            
            // Increment visits count for the active player
            node.visits[player] += 1
            
            moves = this.get_actions(node)
            game.performTurn(moves)
            choices = [game.getPossibleMoves(0), game.getPossibleMoves(1)]
            state = new State(game.battle)

            // This is never returning true
            child = _.find(node.children, function(c) {
                return _.isEqual(c.moves, moves) && _.isEqual(c.state, state)
            });
            
            if(!!child)
            {
                node = child;
            }
            else {
                node = this.expand(node, moves, choices, state)
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
    expand(node, moves, choices, state) {
        return node.get_child(moves, choices[0], choices[1], state)
    }

    /** Determinize a battleside using the probabilities in the set */
    determinize(battleside) {

        _.each(battleside.pokemon, function(pokemon) {
            if(!!pokemon.set.probabilities) {
                var set = pokemon.set

                set.item = sample_from(set.probabilities.items, function(e){return e[1]})[0]
                set.evs = _.sample(set.probabilities.evs)
                //set.moves = pokemon.trueMoves + _.map(_.sampleSize(set.probabilities.moves, 4-pokemon.trueMoves.length), function(m){return m[0]})

                // Create the new pokemon
                var new_pokemon = new BattlePokemon(set, battleside);
                new_pokemon.trueMoves = pokemon.trueMoves
                new_pokemon.nickname = pokemon.nickname
                pokemon.position = pokemon.position;
                battleside.pokemon[pokemon.position] = new_pokemon;

                if (pokemon.position === 0) {
                    battleside.active = [new_pokemon];
                    new_pokemon.isActive = true;
                }
            }
        })
    

        battleside.pokemon = _.sortBy(battleside.pokemon, function(pokemon) { return pokemon.isActive ? 0 : 1 });
        for(var i = 0; i < 6; i++) {
            battleside.pokemon[i].position = i
        }
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
    
    return (p1_health - p2_health) + 600;
    
    // Use minimax heuristic
    //return minimaxbot.eval(this.battle);
}

// Function that decides which move to perform
var overallMinNode = {};
var lastMove = '';
var mcts = new MCTS(150, 4, 0)
var decide = module.exports.decide = function (battle, choices, has_p2_moved) {
    var startTime = new Date();

    log.info("Starting move selection");
    log.info("Given choices: " + JSON.stringify(choices));
    log.info("Has P2 moved? " + has_p2_moved);

    mcts.initTurn(new PokemonBattle(battle), choices, !!has_p2_moved ? [] : null)
    var action = mcts.selectMove();
    if (action === undefined) {
        action = randombot.decide(battle, choices);
        log.info("Randomly selected action");
    }
    
    log.info("My action: " + action.type + " " + action.id);
    lastMove = action.id;
    var endTime = new Date();

    log.info("Decision took: " + (endTime - startTime) / 1000 + " seconds");
    return {
        type: action.type,
        id: action.id
    };
}