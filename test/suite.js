const assert = require('assert');

describe("The launcher", function() {

    it("should set the correct working directory", function() {
        assert.strictEqual(process.cwd(), '/home/node/workspace/test');
    });

    it("Another test", function() {

    });
});
