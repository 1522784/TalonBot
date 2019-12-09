var TeamValidator = require("./../servercode/sim/team-validator").Validator

/** @typedef {{id: string, name: string, [k: string]: any}} DexTemplate */

/** @typedef {{Pokedex: DexTable<Template>, Movedex: DexTable<Move>, Statuses: DexTable<EffectData>, TypeChart: DexTable<TypeData>, Scripts: DexTable<AnyObject>, Items: DexTable<Item>, Abilities: DexTable<Ability>, FormatsData: DexTable<ModdedTemplateFormatsData>, Learnsets: DexTable<{learnset: {[k: string]: MoveSource[]}}>, Aliases: {[id: string]: string}, Natures: DexTable<{[l: string]: string | undefined, name: string, plus?: string, minus?: string}>, Formats: DexTable<Format>}} DexTableData */

	/**
	 * @param {string} format
	 * @return {[DexTableData, string[], string[]]}
	 */
module.exports.getDexData = function(format) {
    let teamValidator = new TeamValidator(format);

    let dexData = teamValidator.dex.loadData()
    dex = Object.keys(dexData.Pokedex); //Includes all species from all Gens
    this.moveDex = [];

    dex = dex.filter(entry => { 
        let problems = teamValidator.validateSet({species: entry}, {});
        return (problems.length === 1); //If it is legal, only one problem must exist: "Pokemon has no moves"
    })
    dex.forEach(poke => {
        Object.keys(teamValidator.dex.getTemplate(poke).learnset).forEach(move => {
            if(!moveDex.includes(move)) moveDex.push(move);
        })
    });

    return [
        dexData,
        dex,
        moveDex
    ];
}