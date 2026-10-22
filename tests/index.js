// Entry point so the documented command `node --test tests/` also works on Node 22+
// (where a directory argument is resolved as a module). It simply loads every test file.
import "./theory.test.mjs";
import "./gestures.test.mjs";
import "./songs.test.mjs";
import "./misc.test.mjs";
import "./classic.test.mjs";
