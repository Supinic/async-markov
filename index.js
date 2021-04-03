module.exports = (function () {
	// const cleanupRegex = /[^\s\w\d?!.]/g;
	const whitespaceRegex = /\s+/g;
	const sentenceRegex = /[?!.]/;

	return class AsyncMarkov {
		/** @type {Map<string, MarkovDescriptor>} */
		#words = new Map();
		#hasSentences = false;

		add (string) {
			if (!this.#hasSentences) {
				this.#hasSentences = sentenceRegex.test(string);
			}

			const data = string
				.trim()
				.replace(whitespaceRegex, " ")
				.split(" ")
				.filter(Boolean);

			const length = data.length;
			if (length < 2) {
				return;
			}

			for (let i = 1; i < length; i++) {
				const first = data[i - 1];
				const second = data[i];

				if (!this.#words.has(first)) {
					this.#words.set(first, {
						total: 0,
						mapped: false,
						sums: null,
						related: {}
					});
				}

				const word = this.#words.get(first);
				if (typeof word.related[second] === "undefined") {
					word.related[second] = 0;
				}

				word.total++;
				word.mapped = false;
				word.related[second]++;
			}

			return this;
		}

		generateWord (root) {
			if (this.#words.size === 0) {
				throw new Error("Cannot generate words, this model has no processed data");
			}

			if (!root) {
				const keys = [...this.#words.keys()];
				const index = Math.trunc(Math.random() * keys.length);
				root = keys[index];
			}

			const object = this.#words.get(root);
			return (object)
				? AsyncMarkov.selectWeighted(object)
				: null;
		}

		generateWords (amount, root = null, options = {}) {
			if (amount <= 0 || Math.trunc(amount) !== amount || !Number.isFinite(amount)) {
				throw new Error("Input amount must be a positive finite integer");
			}

			let current = root;
			const output = [];
			if (current) {
				output.push(current);
			}

			const stop = Boolean(options.stop);
			while (amount--) {
				current = this.generateWord(current);
				if (!current) {
					if (stop) {
						break;
					}
					else {
						current = this.generateWord(null);
					}
				}

				output.push(current);
			}

			return output.join(" ");
		}

		generateSentences (amount, root = null) {
			if (!this.#hasSentences) {
				throw new Error("Model data does not contain delimiters - sentences cannot be generated");
			}
			else if (amount <= 0 || Math.trunc(amount) !== amount || !Number.isFinite(amount)) {
				throw new Error("Amount of sentences must be a positive finite integer");
			}

			let current = root;
			const output = [];
			if (current) {
				output.push(current);
			}

			while (amount > 0) {
				current = this.generateWord(current);
				output.push(current);

				if (sentenceRegex.test(current)) {
					amount--;
				}
			}

			return output.join(" ")
		}

		finalize () {
			const keys = this.keys;
			for (let i = keys.length - 1; i >= 0; i--) {
				AsyncMarkov.calculateWeights(this.#words.get(keys[i]));
			}
		}

		has (word) {
			return this.#words.has(word);
		}

		toJSON () {
			return {
				data: [...this.#words.entries()],
				hasSentences: this.#hasSentences
			};
		}

		load (input) {
			const data = (typeof input === "string") ? JSON.parse(input) : input;

			this.reset();
			this.#words = new Map(data.words);
			this.#hasSentences = data.hasSentences;

			return this;
		}

		reset () {
			for (const value of this.#words.values()) {
				value.related = {};
			}

			this.#words.clear();
		}

		destroy () {
			this.reset();
			this.#words = null;
		}

		get size () {
			return this.#words.size;
		}

		get keys () {
			return [...this.#words.keys()];
		}

		static create (input) {
			const instance = new AsyncMarkov();
			instance.load(input);

			return instance;
		}

		static selectWeighted (object) {
			if (!object.sums || !object.mapped) {
				AsyncMarkov.calculateWeights(object);
			}

			const roll = Math.trunc(Math.random() * object.total);
			const keys = Object.keys(object.sums);
			for (let i = 0; i < keys.length; i++) {
				const pick = keys[i];
				if (roll < pick) {
					return object.sums[pick];
				}
			}

			return null;
		}

		static calculateWeights (object, force = false) {
			if (object.mapped === true && force === false) {
				return;
			}

			let total = 0;
			object.sums = {};

			const keys = Object.keys(object.related);
			const length = keys.length;
			for (let i = 0; i < length; i++) {
				const key = keys[i];
				const value = object.related[key];

				total += value;
				object.sums[total] = key;
			}

			object.mapped = true;
		}
	};
})();

/**
 * @typedef {Object} MarkovDescriptor
 * @property {number} total
 * @property {boolean} mapped
 * @property {Object} sums
 * @property {Map<any,any>} related
 */