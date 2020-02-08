module.exports = (function () {
	const { Readable: ReadableStream } = require("stream");

	const waitImmediate = () => new globalThis.Promise((resolve) => (
		setImmediate(() => resolve())
	));

	return class AsyncMarkov {
		#words = Object.create(null);
		#hasSentences = false;
		#busy = false;
		#prepared = false;

		async process (input, forceBlocking = false) {
			if (this.#busy) {
				return;
			}

			this.#busy = true;

			if (typeof input === "string") {
				await this.processString(input, forceBlocking);
			}
			else if (input instanceof Uint8Array) {
				await this.processBuffer(Buffer.from(input), forceBlocking);
			}
			else if (input instanceof ReadableStream) {
				await this.processStream(input, forceBlocking);
			}
			else {
				throw new Error("Invalid input type provided");
			}

			this.#busy = false;
			this.#prepared = true;

			return this;
		}

		async processBuffer (buffer, forceBlocking) {
			let first = "";
			let second = "";
			const length = buffer.length;
			for (let i = 0; i < length; i++) {
				const char = buffer[i];
				if (!this.#hasSentences && (char === 33 || char === 46 || char === 63)) {
					this.#hasSentences = true;
				}

				if (char === 32) {
					if (first) {
						this._addWords(first, second);
						if (!forceBlocking) {
							await waitImmediate();
						}
					}

					first = second;
					second = "";
				}
				else if (char > 32 && char < 127) {
					second += String.fromCharCode(char);
				}
			}
		}

		processStream (stream, forceBlocking) {
			return new Promise((resolve) => {
				stream.on("data", (chunk) => {
					this.processBuffer(chunk, forceBlocking);
				});

				stream.on("end", () => {
					resolve();
				});
			});
		}

		async processString (string, forceBlocking) {

			if (!this.#hasSentences) {
				this.#hasSentences = (string.indexOf("?") !== -1 || string.indexOf("!") !== -1 || string.indexOf(".") !== -1);
			}

			const data = string.replace(/[^\w\d ]/g, "").replace(/\s+/g, " ").split(" ");
			const length = data.length;

			for (let i = 0; i < length; i++) {
				this._addWords(data[i], data[i + 1]);
				if (!forceBlocking) {
					await waitImmediate();
				}
			}
		}

		finalize () {
			const keys = Object.keys(this.#words);
			for (let i = keys.length - 1; i >= 0; i--) {
				AsyncMarkov.calculateWeights(this.#words[keys[i]]);
			}
		}

		word (root) {
			if (!this.#prepared) {
				throw new Error("Cannot generate words, this model has no processed data");
			}

			if (!root) {
				const keys = Object.keys(this.#words);
				const index = Math.trunc(Math.random() * keys.length);
				root = keys[index];
			}

			const object = this.#words[root];
			return (object)
				? AsyncMarkov.weightedPick(object)
				: null;
		}

		words (amount, root = null) {
			if (amount <= 0 || Math.trunc(amount) !== amount || !Number.isFinite(amount)) {
				throw new Error("Input amount must be a positive finite integer");
			}

			let current = root;
			const output = [];
			if (current) {
				output.push(current);
			}

			while (amount--) {
				current = this.word(current);
				if (!current) {
					current = this.word(null);
				}

				output.push(current);
			}

			return output.join(" ");
		}

		sentences (amount, root = null) {
			if (!this.#hasSentences) {
				throw new Error("Model data has no sentences - cannot re-create");
			}
			else if (amount <= 0 || Math.trunc(amount) !== amount || !Number.isFinite(amount)) {
				throw new Error("Amount of sentences must be a positive finite integer");
			}

			let current = root;
			const output = [];
			if (current) {
				output.push(current);
			}

			while (amount >= 0) {
				current = this.word(current);
				output.push(current);

				if (current.indexOf("?") !== -1 || current.indexOf("!") !== -1 || current.indexOf(".") !== -1) {
					amount--;
				}
			}

			return output.join(" ");
		}

		_addWords (first, second) {
			if (typeof this.#words[first] === "undefined") {
				this.#words[first] = {
					total: 1,
					related: {},
					mapped: null
				};
			}
			else {
				this.#words[first].total++;
			}

			if (typeof this.#words[first].related[second] === "undefined") {
				this.#words[first].related[second] = 1;
			}
			else {
				this.#words[first].related[second]++;
			}
		}

		save () {
			return JSON.stringify({
				data: this.#words,
				hasSentences: this.#hasSentences
			});
		}

		load (json) {
			const data = JSON.parse(json);
			this.#words = data.words;
			this.#hasSentences = data.hasSentences;
		}

		get size () { return Object.keys(this.#words).length; }
		get busy () { return this.#busy; }
		get prepared () { return this.#prepared; }

		static weightedPick (object) {
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