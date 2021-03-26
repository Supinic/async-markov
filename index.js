module.exports = (function () {
	// const cleanupRegex = /[^\s\w\d?!.]/g;
	const whitespaceRegex = /\s+/g;
	const sentenceRegex = /[?!.]/;

	return class AsyncMarkov {
		#words = Object.create(null);
		#hasSentences = false;

		add (string) {
			if (!this.#hasSentences) {
				this.#hasSentences = sentenceRegex.test(string);
			}

			const data = string.replace(whitespaceRegex, " ").split(" ");
			const length = data.length;
			if (length < 2) {
				return;
			}

			for (let i = 1; i < length; i++) {
				const first = data[i - 1];
				const second = data[i];

				if (typeof this.#words[first] === "undefined") {
					this.#words[first] = {
						total: 0,
						related: {},
						mapped: null
					};
				}

				if (typeof this.#words[first].related[second] === "undefined") {
					this.#words[first].related[second] = 0;
				}

				this.#words[first].total++;
				this.#words[first].related[second]++;
			}

			return this;
		}

		finalize () {
			const keys = Object.keys(this.#words);
			for (let i = keys.length - 1; i >= 0; i--) {
				AsyncMarkov.calculateWeights(this.#words[keys[i]]);
			}
		}

		generateWord (root) {
			if (Object.keys(this.#words).length === 0) {
				throw new Error("Cannot generate words, this model has no processed data");
			}

			if (!root) {
				const keys = Object.keys(this.#words);
				const index = Math.trunc(Math.random() * keys.length);
				root = keys[index];
			}

			const object = this.#words[root];
			return (object)
				? AsyncMarkov.selectWeighted(object)
				: null;
		}

		generateWords (amount, root = null) {
			if (amount <= 0 || Math.trunc(amount) !== amount || !Number.isFinite(amount)) {
				throw new Error("Input amount must be a positive finite integer");
			}

			let current = root;
			const output = [];
			if (current) {
				output.push(current);
			}

			while (amount--) {
				current = this.generateWord(current);
				if (!current) {
					current = this.generateWord(null);
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

		toJSON () {
			return {
				data: this.#words,
				hasSentences: this.#hasSentences
			};
		}

		destroy () {
			for (const first of Object.keys(this.#words)) {
				this.#words[first].related = null;
			}

			this.#words = null;
		}

		get size () {
			return Object.keys(this.#words).length;
		}

		static load (json) {
			const data = JSON.parse(json);
			const instance = new AsyncMarkov();

			instance.#words = data.words;
			instance.#hasSentences = data.hasSentences;

			return instance;
		}

		static selectWeighted (object) {
			if (!object.mapped) {
				AsyncMarkov.calculateWeights(object);
			}

			const roll = Math.trunc(Math.random() * object.total);
			for (const pick of Object.keys(object.mapped)) {
				if (roll < pick) {
					return object.mapped[pick];
				}
			}

			return null;
		}

		static calculateWeights (object) {
			let total = 0;
			object.mapped = {};

			const keys = Object.keys(object.related);
			const length = keys.length;
			for (let i = 0; i < length; i++) {
				const key = keys[i];
				const value = object.related[key];

				total += value;
				object.mapped[total] = key;
			}
		}
	};
})();