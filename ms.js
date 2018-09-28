'use strict';

// https://stackoverflow.com/a/9716488
const isNumeric = x => !isNaN(parseFloat(x)) && isFinite(x);

// Functions that return dom elems or collections of dom elems start with $
// Dom elems and collections of dom elems start with $
// Functions that accept dom elems or collections of dom elems end with $
// The one exception is game.$

const ident = x => x;
function cookiesProxy(args) {
    // Expects dict of args:
    // { name: cookie name (required)
    //   default_: default value (optional, default undefined)
    //   encode: encoding function (to string, optional)
    //   decode: decoding function (from string, optional) }
    let pxy = (newVal) =>
        newVal ? Cookies.set(args.name, (args.encode || ident)(newVal))
               : (args.decode || ident)(Cookies.get(args.name) || args.default_);
    pxy.expire = () => Cookies.expire(args.name);
    return pxy;
}

// We prepend cookies, which are conceptually values but actually not, with 'c'
let cLydiaMode = cookiesProxy({ name: "lydiamode", default_: "" });

window.addEventListener('load', function() {
    let $lm = document.getElementById('lydia-mode');

    function render_lm() {
        if (cLydiaMode()) {
            $lm.innerHTML = "Lydia mode: ON";
            $lm.classList.add("activated");
        } else {
            $lm.innerHTML = "Lydia mode: OFF";
            $lm.classList.remove("activated");
        }
    }
    render_lm();

    function swap_lm() {
        if (!cLydiaMode()) cLydiaMode("goose");
        else cLydiaMode.expire();
        render_lm();
    }

    $lm.addEventListener('click', swap_lm);
});

let cBoardWidth  = cookiesProxy({ name: "width"    , default_: 30, decode: parseInt });
let cBoardHeight = cookiesProxy({ name: "height"   , default_: 16, decode: parseInt });
let cMineCount   = cookiesProxy({ name: "mineCount", default_: 99, decode: parseInt });

const MINE = "mine";

let randInt = (max) => Math.floor(Math.random() * max);

function shuffle(a){var j,x,i;for(i=a.length-1;i>0;i--){j=Math.floor(Math.random()*(i+1));x=a[i];a[i]=a[j];a[j]=x;}}
function genBoard(height, width, mineCount, y0, x0) { // y0 & x0: coord for a guarnteed 0, if possible
    let board = Array.from(Array(height), _ => Array(width).fill(0));

    board.height = height;
    board.width = width;
    board.mineCount = mineCount;

    function inc(y, x) { // increment value at board unless is mine or is out-of-bounds
        if (y < 0 || x < 0 || y >= height || x >= width) return;
        if (board[y][x] !== MINE) board[y][x]++;
    }
    function placeMine(y, x) {
        board[y][x] = MINE;
        inc(y + 1, x + 1);
        inc(y    , x + 1);
        inc(y - 1, x + 1);
        inc(y + 1, x    );
        inc(y    , x    );
        inc(y - 1, x    );
        inc(y + 1, x - 1);
        inc(y    , x - 1);
        inc(y - 1, x - 1);
    }

    // Fill the board
    let nearY0X0 = (y, x) => // (y, x) in 3x3 sq around (y0, x0)?
        y == y0 && Math.abs(x - x0) <= 1
        || x == x0 && Math.abs(y - y0) <= 1
        || Math.abs(x - x0) === 1 && Math.abs(y - y0) === 1;

    let adjacentBoardPositions = [];
    let nonAdjacentBoardPositions = [];

    for (let y = 0; y < board.height; y++)
        for (let x = 0; x < board.width; x++)
            if (nearY0X0(y, x)) {
                if (!(y === y0 && x === x0)) // Exclude (y0, x0)
                    adjacentBoardPositions.push([y, x]);
            } else
                nonAdjacentBoardPositions.push([y, x]);

    shuffle(adjacentBoardPositions);
    shuffle(nonAdjacentBoardPositions);

    while (mineCount > 0 && nonAdjacentBoardPositions.length > 0) {
        let pos = nonAdjacentBoardPositions.pop();
        placeMine(pos[0], pos[1]);
        mineCount--;
    }

    while (mineCount > 0 && adjacentBoardPositions.length > 0) { // Out of adjacent board positions but still mines left to place
        let pos = adjacentBoardPositions.pop();
        placeMine(pos[0], pos[1]);
        mineCount--;
    }

    if (mineCount > 0) // If we STILL don't have enough mines down, there's only one spot left:
        placeMine(y0, x0);

    return board;
}

const rowClass = "cell-row";
const cellClass = "cell";
const blankClass = "blank";
function renderBoard(board) {
    let $board = document.createElement("div");
    $board.classList.add("game");

    for (let y = 0; y < board.length; y++) {
        let row = board[y];
        let $row = document.createElement("div");
        $row.classList.add(rowClass);

        for (let x = 0; x < row.length; x++) {
            let cellVal = row[x];
            let $cell = document.createElement("div");
            $cell.y = y;
            $cell.x = x;

            $cell.classList.add(cellClass, blankClass, isNumeric(cellVal) ? (cellClass + cellVal) : "mine");
            $row.appendChild($cell);
        }

        $board.appendChild($row);
    }

    return $board;
}

function dispBombsLeft(n) {
    document.getElementById("mines-left").innerHTML = n;
}

function genGame(board) {
    let game = new Object();

    game.board = board;
    board = undefined; // Ensure referencing `game.board` from now on
    game.$board = renderBoard(game.board);

    // Game attributes

    game.ended = false; // Game over?
    game.flagCount = 0; // Number of flag$s placed

    game.unprocedCount = game.board.width * game.board.height; // Number of unproced cells

    game.$ = function(coords) {
        // Takes an abitrarily deeply (dim 0 inclusive) nested list of coordinates [y,x] and maps them to their $cells
        if (coords.length > 0 && isNumeric(coords[0])) return game.$get(...coords);
        return coords.map(game.$);
    }

    game.won = () => game.unprocedCount == game.board.mineCount;
    game.win = () => {
        game.ended = true;
        game.$board.classList.add("win");
        game.procMines();
    };
    game.lose = () => {
        game.ended = true;
        game.$board.classList.add("loss");
        game.procMines();
    };
    game.procMines = () => {
        for (let y = 0; y < game.board.height; y++)
            for (let x = 0; x < game.board.width; x++)
                if (game.board[y][x] === MINE)
                    game.reveal$(game.$get(y, x));
    };

    game.$get = (y, x) => {
        return Array.from(Array.from(game.$board.childNodes)
            .filter(e => e.classList.contains(rowClass))[y].childNodes)
            .filter(e => e.classList.contains(cellClass))[x];
    };
    game.get$ = ($cell) => {
        return game.board[$cell.y][$cell.x];
    };
    game.$get$ = ($cell) => $cell; // hm

    game.reveal$ = ($cell) => {
        $cell.classList.remove(blankClass);
    }
    game.proc$ = ($cell) => {
        if (game.isFlagged$($cell) || game.isRevealed$($cell)) return;
        game.reveal$($cell);
        let val = game.get$($cell);

        game.unprocedCount--;
        if (val === MINE) game.lose();
        else if (game.won()) game.win();

        if (val === 0) { // Propogate on 0s
            proc_rec$($get_f($cell.y + 1, $cell.x + 1));
            proc_rec$($get_f($cell.y    , $cell.x + 1));
            proc_rec$($get_f($cell.y - 1, $cell.x + 1));
            proc_rec$($get_f($cell.y + 1, $cell.x    ));
            proc_rec$($get_f($cell.y    , $cell.x    ));
            proc_rec$($get_f($cell.y - 1, $cell.x    ));
            proc_rec$($get_f($cell.y + 1, $cell.x - 1));
            proc_rec$($get_f($cell.y    , $cell.x - 1));
            proc_rec$($get_f($cell.y - 1, $cell.x - 1));
        }
    };
    let $get_f = (y, x) => { // 'Forgiving' get
        if (y < 0 || x < 0 || y >= game.board.height || x >= game.board.width) return null;
        return game.$get(y, x);
    };
    let proc_rec$ = ($cell) => { // Recursive case
        if ($cell === null || game.isRevealed$($cell)) return;
        game.proc$($cell);
    };
    game.isRevealed$ = ($cell) => {
        return !$cell.classList.contains(blankClass);
    };

    game.neighbors$ = ($cell) => {
        let ret = [];

        if ($cell.y > 0) {
            ret.push([$cell.y - 1, $cell.x])
            if ($cell.x > 0) ret.push([$cell.y - 1, $cell.x - 1])
            if ($cell.x < game.board.width - 1) ret.push([$cell.y - 1, $cell.x + 1])
        }

        if ($cell.y < game.board.height - 1) {
            ret.push([$cell.y + 1, $cell.x])
            if ($cell.x > 0) ret.push([$cell.y + 1, $cell.x - 1])
            if ($cell.x < game.board.width - 1) ret.push([$cell.y + 1, $cell.x + 1])
        }

        if ($cell.x > 0) ret.push([$cell.y, $cell.x - 1]);
        if ($cell.x < game.board.width - 1) ret.push([$cell.y, $cell.x + 1]);

        return ret;
    }
    game.chord$ = ($cell) => {
        // If a cell has all neighboring mines flag$ged, proc all non-flag$s
        let $neis = game.$(game.neighbors$($cell));
        if ($neis.filter(game.isFlagged$).length == game.get$($cell))
            $neis.filter(c => !game.isFlagged$(c)).forEach(game.proc$);
    }

    let updateBombCount = () => dispBombsLeft(!boardDisturbed ? cMineCount() : game.board.mineCount - game.flagCount);
    updateBombCount();

    game.flag$ = ($cell) => {
        if (game.isRevealed$($cell) || game.isFlagged$($cell)) return;
        $cell.classList.add("flag");
        game.flagCount++;
        if (game.get$($cell) !== MINE) game.incorrectFlagCount++;
        updateBombCount();
    };
    game.unflag$ = ($cell) => {
        if (!game.isFlagged$($cell)) return;
        $cell.classList.remove("flag");
        game.flagCount--;
        if (game.get$($cell) !== MINE) game.incorrectFlagCount--;
        updateBombCount();
    };
    game.isFlagged$ = ($cell) => {
        return $cell.classList.contains("flag");
    };
    game.toggleFlagged = ($cell) => {
        if (game.isFlagged$($cell)) game.unflag$($cell);
        else game.flag$($cell);
    };

    // Selected cell

    game.selY = null;
    game.selX = null;
    game.$sel = null;

    const mod = (v, n) => ((v % n) + n) % n; // Python-style mod
    game.setSelected = (y, x) => {
        game.selY = mod(y, game.board.height);
        game.selX = mod(x, game.board.width);

        if (game.$sel !== null) game.$sel.classList.remove("selected");
        game.$sel = game.$get(game.selY, game.selX);
        game.$sel.classList.add("selected");
    };
    game.moveSelected = (dY, dX) => {
        game.setSelected(game.selY + dY, game.selX + dX);
    };
    game.setSelected(0, 0);

    return game;
}

var $wrap;
window.addEventListener('load', () => $wrap = document.getElementById("ms-wrap"));

function playGame(game) {
    // Top-level control function
    $wrap.innerHTML = "";
    $wrap.appendChild(game.$board);
    updateMetadataDisplay();
}

function updateMetadataDisplay() {
    var width, height, mineCount;

    width = game.board.width;
    height = game.board.height;

    if (!boardDisturbed) // Spoof boards have 0 mines so we must spoof mine count
        mineCount = cMineCount();
    else
        mineCount = game.board.mineCount;

    document.getElementById("width").innerHTML = width;
    document.getElementById("height").innerHTML = height;
    document.getElementById("mine-count").innerHTML = mineCount;

    document.getElementById("mine-count-percent").innerHTML = (mineCount / (width * height) * 100).toFixed(2);
}

var game = null;
function playGame_sel(newGame) {
    // Play a game, but keep the selected cell in the same spot (if possible)
    if (game !== null)
        newGame.setSelected(game.selY, game.selX);
    game = newGame;
    playGame(game);
}

// Before the user procs a cell, we display a blank 'sham board'.
// Once the user procs a cell, we generate the actual board.
// This way, we can guarantee that the first cell is a 0 (if possible)
// We keep track of whether the board has been 'disturbed', i.e. a cell has been proced
var boardDisturbed;

function playSham() {
    // Generate and play a sham board
    boardDisturbed = false;
    playGame_sel(genGame(genBoard(
        cBoardHeight(),
        cBoardWidth(),
        0 // Not a real game, so generate no mines
    )));
}
function playReal() {
    // Generate and play a real board
    boardDisturbed = true;
    let realGame = genGame(genBoard(
        cBoardHeight(),
        cBoardWidth(),
        cMineCount(),
        game.selY,
        game.selX
    ));
    // Copy over flag$s from sham game
    for (let y = 0; y < game.board.height; y++)
        for (let x = 0; x < game.board.width; x++)
            if (game.isFlagged$(game.$get(y, x)))
                realGame.flag$(realGame.$get(y, x));
    playGame_sel(realGame);
}

window.addEventListener('load', playSham);

window.addEventListener('keydown', function(e) {
    let dist = cLydiaMode() && (
               e.keyCode == 37
            || e.keyCode == 38
            || e.keyCode == 39
            || e.keyCode == 40
        ) ? 5 : 1;

    switch(e.keyCode) {
        case 38: // Up
        case 75: // K
            game.moveSelected(-dist, 0);
            break;

        case 40: // Down
        case 74: // J
            game.moveSelected(dist, 0);
            break;

        case 37: // Left
        case 72: // H
            game.moveSelected(0, -dist);
            break;

        case 39: // Right
        case 76: // L
            game.moveSelected(0, dist);
            break;

        case 70: // F
            if (!game.ended) game.toggleFlagged(game.$sel);
            break;

        case 32: // Space
            {
                if (!boardDisturbed && !game.isFlagged$(game.$sel)) // Noop if an empty cell (.isFlagged$ is code smell?)
                    playReal();

                if (!game.ended) {
                    if (game.isRevealed$(game.$sel))
                        game.chord$(game.$sel);
                    else
                        game.proc$(game.$sel);
                }
            }
            break;

        case 82: // R
            playSham();
            break;

        case 219: // [
            cBoardWidth(Math.max(1, cBoardWidth() - 1));
            playSham();
            break;
        case 221: // ]
            cBoardWidth(cBoardWidth() + 1);
            playSham();
            break;

        case 186: // ;
            cBoardHeight(Math.max(1, cBoardHeight() - 1));
            playSham();
            break;
        case 222: // '
            cBoardHeight(cBoardHeight() + 1);
            playSham();
            break;

        case 188: // ,
            cMineCount(Math.max(1, cMineCount() - 1));
            playSham();
            break;
        case 190: // .
            cMineCount(cMineCount() + 1);
            playSham();
            break;
    }
});

