import 'babel-polyfill';
import React from 'react';
import ReactDOM from 'react-dom';
import blocksPng from '../assets/blocks.png';
import webTetris from '../../Cargo.toml';

const containerStyle = {
  height: '100%',
  fontFamily: "'Press Start 2P', sans-serif",
  color: '#fff',
  display: 'inline-block',
  textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
  background: 'cover url("background.jpg")'
};

class Tetris extends React.Component {
  render() {
    return (
      <div style={containerStyle}>
        <PauseOverlay />
        <div style={{height:'100%', float: 'left'}}>
          <PieceDisplay label="Hold" event="holdPiece" />
          <ScoreBox />
        </div>
        <div style={{height: '100%', float: 'left'}}>
          <PlayArea />
        </div>
        <div style={{height:'100%', float: 'left'}}>
          <PieceDisplay label="Next" event="nextPiece" />
        </div>
      </div>
    );
  }
}

const pieceDisplayStyle = {
  width: '200px',
  height: '200px',
  display: 'inline-block',
  textAlign: 'right'
};

class PieceDisplay extends React.Component {
  constructor(props) {
    super(props);
    this.event = props.event;
    this.label = props.label;
  }

  componentDidMount() {
    this.ctx = this.canvas.getContext("2d");
    tetris.addEventListener(this.event, (render) => (render(this.ctx)));
  }

  render() {
    return <div>
      <h2>{ this.label }</h2>
      <canvas width="250" height="250" ref={(canvas) => {this.canvas = canvas; }} style={pieceDisplayStyle} ></canvas>
      </div>;
  }
}

class ScoreBox extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      score: 0,
      lines: 0,
      level: 0
    };
  }

  updateScore(score) {
    this.setState(score);
  }

  componentDidMount() {
    tetris.addEventListener('score', (score) => this.updateScore(score));
  }

  render() {
    return (
      <div style={{fontSize: '16pt', listStyle:'none', margin: '10px'}}>
        <ScoreLine label="Level" value={this.state.level} />
        <ScoreLine label="Lines" value={this.state.lines} />
        <ScoreLine label="Score" value={this.state.score} />
      </div>
    );
  }
}

const ScoreLine = ({label, value}) =>
      <div><div>{label}:</div><div style={{textAlign: 'right'}}>{value}</div></div>;

class PauseOverlay extends React.Component {
  constructor(props) {
    super(props);
    this.state = { paused: false };
  }

  componentDidMount() {
    tetris.addEventListener('paused', (paused) => { this.setState({paused: paused}); });
  }

  render() {
    if (this.state.paused) {
      return <div style={{position: 'static', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.3)', lineHeight: '500px', verticalAlign: 'middle', fontSize: '40pt'}}>PAUSED</div>;
    } else {
      return <div />;
    }
  }
}

const playAreaStyle = {
  width: 'auto',
  height: 'calc(100% - 18px)',
  display: 'inline-block',
  border: '#c0c ridge 4px',
  borderRadius: '5px',
  margin: '5px'
};

class PlayArea extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    return <canvas style={playAreaStyle} ref={(canvas) => { this.canvas = canvas; }}></canvas>;
  }

  async componentDidMount() {
    await tetris.init();
    tetris.start(this.canvas);
  }

  componentWillUnmount() {
    if (tetris) {
      tetris.stop();
    }
  }
}

class TetrisGame {
  constructor() {
    this.stopped = false;
    this.inited = false;
    this.pause = false;
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.wasTetris = false;
    this.events = [];
    this.width = 50;
    this.height = 50;
  }

  addEventListener(name, func) {
    this.events.push({name: name, func: func});
  }

  trigger(name, data) {
    this.events
      .filter((handler) => handler.name === name)
      .forEach((handler) => handler.func(data));
  }

  loadBlocks() {
    return new Promise(resolve => {
      let blocksImage = new Image();
      blocksImage.src = blocksPng;
      blocksImage.onload = () => {
        resolve(blocksImage);
      };
    });
  }

  async init() {
    this.blocks = await this.loadBlocks();
    this.renderBackground();
    this.renderBlocks();
    this.renderNextPiece();
    this.inited = true;
  }

  start(canvas) {
    this.stopping = false;
    canvas.width = this.width * 10;
    canvas.height = this.height * 20;
    this.ctx = canvas.getContext("2d");

    document.addEventListener("keydown", (key) => this.input(key));
    window.requestAnimationFrame(() => this.tick());
    webTetris.set_speed(this.level / 20.0);
  }

  tick() {
    if (!this.pause) {
      const update = webTetris.tick();
      this.updateScore(update.lines);
      if (update.frozen) {
        this.renderBlocks();
        this.renderNextPiece();
        this.renderHoldPiece();
      }
      this.renderPieces();
    }

    if (!this.stopping) {
      window.requestAnimationFrame(() => this.tick());
    }
  }

  updateScore(lines) {
    if (lines != 0) {
      this.wasTetris = false;
      switch(lines) {
      case 1:
        this.score += 100 * this.level;
        break;
      case 2:
        this.score += 300 * this.level;
        break;
      case 3:
        this.score += 500 * this.level;
        break;
      case 4:
        if (this.wasTetris) {
          this.score += 1200 * this.level;
        } else {
          this.score += 800 * this.level;
        }
        this.wasTetris = true;
        break;
      }
      this.lines += lines;
      let newLevel = ((this.lines / 10) | 0) + 1;
      if (this.level != newLevel) {
        this.level = newLevel;
        if (this.level <= 20) {
          webTetris.set_speed(this.level / 20.0);
        } else {
          webTetris.set_speed(1);
        }
      }
      this.trigger("score", {score: this.score, lines: this.lines, level: this.level});
    }
  }

  input(input) {
    if (input.key == " ") {
      this.togglePause();
      this.trigger("paused", this.pause);
    } else if (input.key == "]") {
      this.lines += 10;
    }
    if (!this.pause) {
      webTetris.key(input.key);
    }
  }

  stop() {
    this.stopping = true;
  }

  togglePause() {
    this.pause = !this.pause;
  }

  renderBackground() {
    let canvas = document.createElement("canvas");
    canvas.width = this.width * 10;
    canvas.height = this.height * 20;
    let ctx = canvas.getContext('2d');
    ctx.globalAlpha = 0.95;
    for(let x = 0; x < 10; x++) {
      for(let y = 0; y < 20; y++) {
        ctx.drawImage(this.blocks, 7 * 50, 0, 50, 50, x * this.width, y * this.height, this.width, this.height);
      }
    }

    this.backgroundCanvas = canvas;
  }

  renderBlocks() {
    if (!this.blocksCtx) {
      let canvas = document.createElement("canvas");
      canvas.width = this.width * 10;
      canvas.height = this.height * 20;
      this.blocksCtx = canvas.getContext('2d');
    }
    let blocks = webTetris.get_blocks();

    this.blocksCtx.clearRect(0, 0, this.blocksCtx.canvas.width, this.blocksCtx.canvas.height);
    this.blocksCtx.drawImage(this.backgroundCanvas, 0, 0);

    this.drawBlocks(this.blocksCtx, blocks, "#fff");
  }

  renderPieces() {
    let piece = webTetris.get_active_piece();
    let dropPiece = webTetris.get_drop_piece();
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.drawImage(this.blocksCtx.canvas, 0, 0);

    this.ctx.globalAlpha = 0.33;
    this.drawBlocks(this.ctx, dropPiece, false);

    let color = this.getSkirtColor(piece.data[0]);
    this.ctx.globalAlpha = 1;
    this.drawBlocks(this.ctx, piece, color);
  }

  renderNextPiece() {
    let fn = (ctx) => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      let piece = webTetris.get_next_piece();
      piece.data.forEach(p => { p.point.x += 0.5; p.point.y += 0.5; });

      let color = this.getSkirtColor(piece.data[0]);
      this.drawBlocks(ctx, piece, color);
    };

    this.trigger("nextPiece", fn);
  }

  renderHoldPiece() {
    let fn = (ctx) => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      let piece = webTetris.get_hold_piece();
      piece.data.forEach(p => { p.point.x += 0.5; p.point.y += 0.5; });

      if (piece.data.length > 0) {
        let color = this.getSkirtColor(piece.data[0]);
        this.drawBlocks(ctx, piece, color);
      }
    };

    this.trigger("holdPiece", fn);
  }

  drawBlocks(ctx, blocks, skirtColor) {
    ctx.fillStyle = skirtColor;
    let skirtSize = 5;
    for (let i = 0; i < blocks.data.length && skirtColor; i++) {
      let block = blocks.data[i];
      ctx.fillRect((block.point.x * this.width) - skirtSize,
                   (block.point.y * this.height) - skirtSize,
                   this.width + (skirtSize * 2),
                   this.height + (skirtSize * 2));
    }
    for (let i = 0; i < blocks.data.length; i++) {
      let block = blocks.data[i];
      let offset = this.getSpriteData(block);
      ctx.drawImage(this.blocks,
                    offset * 50,
                    0,
                    50,
                    50,
                    block.point.x * this.width,
                    block.point.y * this.height,
                    this.width,
                    this.height);
    }
  }

  getSkirtColor(block) {
    switch(block.piece) {
    case "T":
      return "#d8f";
    case "S":
      return "#8f8";
    case "I":
      return "#8ff";
    case "Z":
      return "#f88";
    case "L":
      return "#fd8";
    case "J":
      return "#88f";
    case "O":
      return "#ff8";
    default:
      throw "Invalid Block Type " + block.piece;
    }
  }

  getSpriteData(block) {
    switch(block.piece) {
    case "T":
      return 6;
    case "S":
      return 0;
    case "I":
      return 3;
    case "Z":
      return 2;
    case "L":
      return 5;
    case "J":
      return 4;
    case "O":
      return 1;
    default:
      throw "Invalid Block Type " + block.piece;
    }
  }
}

const tetris = new TetrisGame();

ReactDOM
  .render(<Tetris />, document.getElementById("root"));
