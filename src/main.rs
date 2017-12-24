#![recursion_limit="1024"]

extern crate random;
#[macro_use]
extern crate stdweb;
#[macro_use]
extern crate serde_derive;

use std::cell::RefCell;

thread_local! {
    static GAME_STATE: RefCell<Tetris> = RefCell::new(Tetris::new());
}


fn main() {
    ::stdweb::initialize();

    js! {
        Module.exports.tick = @{tick};
        Module.exports.key = @{key};
        Module.exports.setSpeed = @{set_speed};
    }

    js! {
        Module.exports.getNextPiece = @{get_next_piece};
        Module.exports.getActivePiece = @{get_active_piece};
        Module.exports.getDropPiece = @{get_drop_piece};
        Module.exports.getBlocks = @{get_blocks};
    }
}

fn tick() -> TickState {
    GAME_STATE.with(|g| {
        let game = &mut *g.borrow_mut();
        game.tick()
    })
}

fn set_speed(speed: f64) {
    GAME_STATE.with(|g| {
        let game = &mut *g.borrow_mut();
        let speed = 21 - (speed * 20.0) as i32;
        game.speed = speed;
    });
}

fn get_next_piece() -> BlockData {
    GAME_STATE.with(|g| {
        let game = &*g.borrow();
        game.get_next_piece()
    })
}

fn get_active_piece() -> BlockData {
    GAME_STATE.with(|g| {
        let game = &*g.borrow();
        game.get_active_piece()
    })
}

fn get_drop_piece() -> BlockData {
    GAME_STATE.with(|g| {
        let game = &*g.borrow();
        game.get_drop_piece()
    })
}

fn get_blocks() -> BlockData {
    GAME_STATE.with(|g| {
        let game = &*g.borrow();
        game.get_blocks()
    })
}

fn key(key: String) {
    let event = match &*key {
        "ArrowUp" => Some(Input::Clockwise),
        "ArrowLeft" => Some(Input::Left),
        "ArrowRight" => Some(Input::Right),
        "ArrowDown" => Some(Input::Down),
        "Shift" => Some(Input::CounterClockwise),
        "Enter" => Some(Input::Drop),
        _ => None,
    };

    if let Some(input) = event {
        GAME_STATE.with(|g| {
            let game = &mut *g.borrow_mut();
            game.handle_input(input);
        })
    }
}

pub struct Tetris {
    sack: PieceSack,
    next_piece: Piece,
    active_piece: ActivePiece,
    events: Vec<Input>,
    board: Board,
    speed: i32,
    drop_timer: i32,
}

impl Tetris {
    pub fn new() -> Self {
        let mut sack = PieceSack::new();
        let speed = 5;
        let width = 10;
        let height = 20;
        Self {
            active_piece: ActivePiece::new(sack.next()),
            next_piece: sack.next(),
            events: Vec::new(),
            board: Board::new(width, height),
            speed,
            drop_timer: speed,
            sack,
        }
    }

    pub fn set_speed(&mut self, speed: i32) {
        self.speed = speed;
        self.drop_timer = speed;
    }

    pub fn handle_input(&mut self, input: Input) {
        self.events.push(input);
    }

    pub fn swap_piece(&mut self) {
        self.active_piece = ActivePiece::new(self.next_piece);
        self.next_piece = self.sack.next();
        self.drop_timer = self.speed;
        if self.board.collide(&self.active_piece) {
            self.board.clear();
        }
    }

    pub fn tick(&mut self) -> TickState {
        let mut frozen = false;
        let events: Vec<_> = self.events.drain(..).collect();
        for event in &events {
            use Input::*;
            let mut piece = match *event {
                Left => self.active_piece.do_move(MOVE_LEFT),
                Right => self.active_piece.do_move(MOVE_RIGHT),
                Down => self.active_piece.lower(),
                Drop => self.active_piece.drop(),
                Clockwise => self.active_piece.rotate_clockwise(),
                CounterClockwise => self.active_piece.rotate_counterclockwise(),
            };

            if piece.dropping {
                let mut piece = piece;
                let mut next_piece = piece.clone();
                while !self.board.collide(&next_piece) {
                    piece = next_piece;
                    next_piece = piece.lower();
                }
                self.board.freeze(&piece);
                self.swap_piece();
                frozen = true;
            } else if !self.board.collide(&piece) {
                self.active_piece = piece;
            }
        }

        self.drop_timer -= 1;
        let piece = self.active_piece.lower();
        let blocked = self.board.collide(&piece);
        self.active_piece.animate_lower(1.0 / self.speed as f64);
        if self.drop_timer < 0 {
            if blocked {
                self.board.freeze(&self.active_piece);
                self.swap_piece();
                frozen = true;
            } else {
                self.active_piece = piece;
            }
            self.drop_timer = self.speed;
        }

        let lines = self.board.clear_lines();

        TickState {
            lines,
            frozen
        }
    }

    pub fn get_active_piece(&self) -> BlockData {
        let fine_y = self.active_piece.fine_y;
        let piece = self.active_piece.piece;
        let data = self.active_piece.shape()
            .iter()
            .map(|p| Point { x: p.x as f64, y: p.y as f64 + fine_y - 1.0 })
            .map(|point| Block { point, piece })
            .collect();
        BlockData {
            data,
        }
    }

    pub fn get_drop_piece(&self) -> BlockData {
        let mut drop_shadow = self.active_piece.clone();
        drop_shadow.fine_y = 0.0;
        if !self.board.collide(&drop_shadow) {
            loop {
                let next_piece = drop_shadow.do_move(MOVE_DOWN);
                if self.board.collide(&next_piece) {
                    break;
                } else {
                    drop_shadow =  next_piece;
                }
            }
            let fine_y = drop_shadow.fine_y;
            let piece = drop_shadow.piece;
            let data = drop_shadow.shape()
                .iter()
                .map(|p| Point { x: p.x as f64, y: p.y as f64 + fine_y })
                .map(|point| Block { point, piece })
                .collect();
            BlockData {
                data,
            }
        } else {
            BlockData {
                data: vec![],
            }
        }
    }

    pub fn get_next_piece(&self) -> BlockData {
        let data = self.next_piece.display().iter()
            .map(|point| Block { point: *point, piece: self.next_piece })
            .collect();

        BlockData {
            data,
        }
    }

    pub fn get_blocks(&self) -> BlockData {
        BlockData {
            data: self.board.points(),
        }
    }
}

#[derive(Serialize)]
pub struct BlockData {
    data: Vec<Block>,
}

js_serializable!( BlockData );

#[derive(Serialize)]
pub struct Block {
    point: Point<f64>,
    piece: Piece,
}

#[derive(Serialize)]
pub struct TickState {
    lines: u32,
    frozen: bool,
}

js_serializable!( TickState );

struct Board {
    cells: Cells,
}

impl Board {
    fn new(width: usize, height: usize) -> Self {
        Self {
            cells: Cells::new(width, height),
        }
    }

    fn collide(&self, piece: &ActivePiece) -> bool {
        for p in piece.shape() {
            if self.cells.collide(p) {
                return true;
            }
        }
        false
    }

    fn freeze(&mut self, piece: &ActivePiece) {
        for p in piece.shape() {
            self.cells.set(p, Some(piece.piece));
        }
    }

    fn clear_lines(&mut self) -> u32 {
        self.cells.clear_lines()
    }

    fn clear(&mut self) {
        self.cells.clear();
    }

    fn points(&self) -> Vec<Block> {
        self.cells.points()
    }
}

#[derive(Clone)]
struct Cells {
    width: usize,
    height: usize,
    cells: Vec<Option<Piece>>,
}

impl Cells {
    fn new(width: usize, height: usize) -> Self {
        Self {
            width,
            height,
            cells: vec![None; width * height],
        }
    }

    fn collide(&self, p: Point<i32>) -> bool {
        if p.y < 0 && p.x >= 0 && (p.x as usize) < self.width {
            false
        } else if p.x < 0 || p.x as usize >= self.width || p.y as usize >= self.height {
            true
        } else {
            let index = p.y as usize * self.width + p.x as usize;

            self.cells.get(index)
                .unwrap_or(&None)
                .is_some()
        }
    }

    fn set(&mut self, p: Point<i32>, piece: Option<Piece>) {
        if p.x >= 0 && (p.x as usize) < self.width && p.y >= 0 && (p.y as usize) < self.height {
            let index = p.y as usize * self.width + p.x as usize;

            if let Some(cell) =self.cells.get_mut(index) {
                *cell = piece;
            }
        }
    }

    fn get(&self, p: Point<i32>) -> Option<Piece> {
        if p.x >= 0 && (p.x as usize) < self.width && p.y >= 0 && (p.y as usize) < self.height {
            let index = p.y as usize * self.width + p.x as usize;

            self.cells.get(index)
                .map(|c|*c)
                .unwrap_or(None)
        } else {
            None
        }
    }

    fn clear(&mut self) {
        self.cells.iter_mut().for_each(|c| *c = None);
    }

    fn clear_lines(&mut self) -> u32 {
        let mut count = 0;
        let mut y = self.height as i32 - 1;

        while y != -1 {
            let mut acc = 0;
            for x in 0..self.width as i32 {
                let p = point(x,y);

                if self.collide(p) {
                    acc += 1;
                }
            }

            if acc == self.width {
                count += 1;
                let mut y1 = y;
                while y1 != -1 {
                    for x in 0..self.width as i32 {
                        let p = point(x,y1);
                        let new_piece = self.get(point(x, y1 - 1));

                        self.set(p, new_piece);
                    }
                    y1 -= 1;
                }
            } else {
                y -= 1;
            }
        }
        count
    }

    fn points(&self) -> Vec<Block> {
        self.cells.iter()
            .enumerate()
            .filter_map(|(i, c)| c.map(|p| Block { point: point((i % 10) as f64, (i / 10) as f64), piece: p}))
            .collect()
    }
}

use std::ops::Add;

#[derive(Serialize, Debug, Copy, Clone)]
struct Point<T> {
    x: T,
    y: T,
}

fn point<T>(x: T, y: T) -> Point<T> {
    Point{x, y}
}

impl<T: Add<Output=T>> Add for Point<T> {
    type Output = Point<T>;
    fn add(self, rhs: Point<T>) -> Point<T> {
        let x = self.x + rhs.x;
        let y = self.y + rhs.y;
        Point { x, y}
    }
}

const MOVE_LEFT: Point<i32> = Point{x: -1, y: 0};
const MOVE_RIGHT: Point<i32> = Point{x: 1, y: 0};
const MOVE_DOWN: Point<i32> = Point{x: 0, y: 1};

#[derive(Copy, Clone, Debug)]
struct ActivePiece {
    piece: Piece,
    position: Point<i32>,
    rotation: usize,
    dropping: bool,
    fine_y: f64,
}

impl ActivePiece {
    fn new(piece: Piece) -> Self {
        Self {
            piece,
            position: point(3, -3),
            rotation: 0,
            dropping: false,
            fine_y: 0.0
        }
    }

    fn shape(&self) -> Vec<Point<i32>> {
        let shapes = self.piece.shapes();
        let rot = self.rotation % shapes.len();
        shapes[rot].iter()
            .map(|p| *p + self.position)
            .collect()
    }

    fn drop(&self) -> ActivePiece {
        let mut piece = self.clone();
        piece.dropping = true;
        piece
    }

    fn do_move(&self, offset: Point<i32>) -> ActivePiece {
        let mut piece = self.clone();
        piece.position = piece.position + offset;
        piece
    }

    fn animate_lower(&mut self, amt: f64) {
        self.fine_y += amt;
    }

    fn lower(&self) -> ActivePiece {
        let mut piece = self.clone();
        piece.position = piece.position + MOVE_DOWN;
        piece.fine_y = 0.0;
        piece
    }

    fn rotate_clockwise(&self) -> ActivePiece {
        let mut piece = self.clone();
        piece.rotation += 1;
        piece
    }

    fn rotate_counterclockwise(&self) -> ActivePiece {
        let mut piece = self.clone();
        piece.rotation -= 1;
        piece
    }
}


#[derive(Serialize, Debug, Copy, Clone)]
enum Piece {
    I,
    O,
    T,
    S,
    Z,
    J,
    L
}

impl Piece {
    pub fn shapes(&self) -> Shape {
        use Piece::*;
        match *self {
            I => I_SHAPE,
            O => O_SHAPE,
            T => T_SHAPE,
            S => S_SHAPE,
            Z => Z_SHAPE,
            J => J_SHAPE,
            L => L_SHAPE,
        }
    }

    pub fn display(&self) -> Vec<Point<f64>> {
        use Piece::*;
        let offset = match *self {
            I => point(1.0, 0.5),
            O => point(0.5, -0.5),
            T => point(0.0, -0.5),
            S => point(1.0, -0.5),
            Z => point(0.0, -0.5),
            J => point(0.5, 0.0),
            L => point(0.5, 0.0),
        };

        self.shapes()[0].iter().map(|p| {
            Point {
                x: p.x as f64 + offset.x,
                y: p.y as f64 + offset.y,
            }
        }).collect()
    }
}

type Shape = &'static [&'static [Point<i32>]];
const I_SHAPE: Shape = &[&[Point{x:1,y:0}, Point{x:1,y:1}, Point{x:1,y:2}, Point{x:1,y:3}],
                         &[Point{x:0,y:1}, Point{x:1,y:1}, Point{x:2,y:1}, Point{x:3,y:1}]];
const O_SHAPE: Shape = &[&[Point{x:1,y:2}, Point{x:1,y:3}, Point{x:2,y:2}, Point{x:2,y:3}]];
const T_SHAPE: Shape = &[&[Point{x:1,y:3}, Point{x:2,y:3}, Point{x:3,y:3}, Point{x:2,y:2}],
                         &[Point{x:1,y:1}, Point{x:1,y:2}, Point{x:1,y:3}, Point{x:2,y:2}],
                         &[Point{x:1,y:1}, Point{x:2,y:1}, Point{x:3,y:1}, Point{x:2,y:2}],
                         &[Point{x:3,y:1}, Point{x:3,y:2}, Point{x:3,y:3}, Point{x:2,y:2}]];
const S_SHAPE: Shape = &[&[Point{x:0,y:3}, Point{x:1,y:2}, Point{x:1,y:3}, Point{x:2,y:2}],
                         &[Point{x:0,y:1}, Point{x:0,y:2}, Point{x:1,y:2}, Point{x:1,y:3}]];
const Z_SHAPE: Shape = &[&[Point{x:1,y:2}, Point{x:2,y:2}, Point{x:2,y:3}, Point{x:3,y:3}],
                         &[Point{x:3,y:1}, Point{x:2,y:2}, Point{x:3,y:2}, Point{x:2,y:3}]];
const J_SHAPE: Shape = &[&[Point{x:1,y:3}, Point{x:2,y:1}, Point{x:2,y:2}, Point{x:2,y:3}],
                         &[Point{x:1,y:2}, Point{x:1,y:3}, Point{x:2,y:3}, Point{x:3,y:3}],
                         &[Point{x:1,y:1}, Point{x:1,y:2}, Point{x:1,y:3}, Point{x:2,y:1}],
                         &[Point{x:1,y:1}, Point{x:2,y:1}, Point{x:3,y:1}, Point{x:3,y:2}]];
const L_SHAPE: Shape = &[&[Point{x:1,y:1}, Point{x:1,y:2}, Point{x:1,y:3}, Point{x:2,y:3}],
                         &[Point{x:1,y:1}, Point{x:1,y:2}, Point{x:2,y:1}, Point{x:3,y:1}],
                         &[Point{x:3,y:1}, Point{x:3,y:2}, Point{x:3,y:3}, Point{x:2,y:1}],
                         &[Point{x:3,y:2}, Point{x:1,y:3}, Point{x:2,y:3}, Point{x:3,y:3}]];

struct PieceSack {
    pieces: Vec<Piece>,
    rng: ::random::Default,
}

impl PieceSack {
    pub fn new() -> PieceSack {
        PieceSack {
            pieces: Vec::new(),
            rng: ::random::default(),
        }
    }

    fn fill(&mut self) {
        use Piece::*;
        use random::Source;
        let mut source =
            vec![I, O, T, S, Z, J, L];

        let mut sack = Vec::new();
        while source.len() != 0 {
            let index = (self.rng.read_f64() * source.len() as f64) as usize;
            sack.push(source.remove(index));
        }

        self.pieces = sack;
    }

    pub fn next(&mut self) -> Piece {
        if self.pieces.len() == 0 {
            self.fill();
        }

        self.pieces.remove(0)
    }
}

#[derive(Debug, Copy, Clone)]
pub enum Input {
    Left,
    Right,
    Down,
    Drop,
    Clockwise,
    CounterClockwise,
}
