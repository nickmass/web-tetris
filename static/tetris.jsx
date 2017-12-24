import React from 'react';
import ReactDOM from 'react-dom';

const containerStyle = {
  height: '100%',
  fontFamily: "'Press Start 2P', sans-serif",
  color: '#fff',
  display: 'inline-block'
};

class Tetris extends React.Component {
  render() {
    return (
      <div style={containerStyle}>
        <PauseOverlay />
        <div style={{height:'100%', float: 'left'}}>
          <NextPiece />
          <ScoreBox />
        </div>
        <div style={{height: '100%', float: 'left'}}>
          <PlayArea />
        </div>
      </div>
    );
  }
}

const nextPieceStyle = {
  width: '200px',
  height: '200px',
  display: 'inline-block',
  border: '#aaa ridge 4px',
  borderRadius: '5px',
  backgroundColor: '#000',
  margin: '5px',
  padding: '3px',
  imageRendering: 'pixelated',
  textAlign: 'right'
};

class NextPiece extends React.Component {
  constructor(props) {
    super(props);
  }

  updatePiece(piece) {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(piece, 0, 0, piece.width, piece.height, 0, 0, this.canvas.width, this.canvas.height);
    this.setState({});
  }

  componentDidMount() {
    this.ctx = this.canvas.getContext("2d");
    tetris.addEventListener('nextPiece', this.updatePiece.bind(this));
  }

  render() {
    return <canvas width="200" height="200" ref={(canvas) => {this.canvas = canvas; }} style={nextPieceStyle} ></canvas>;
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
    tetris.addEventListener('score', this.updateScore.bind(this));
  }

  render() {
    return (
      <ul style={{fontSize: '16pt', listStyle:'none', margin: '10px'}}>
        <li><ScoreLine label="Level" value={this.state.level} /></li>
        <li><ScoreLine label="Lines" value={this.state.lines} /></li>
        <li><ScoreLine label="Score" value={this.state.score} /></li>
      </ul>
    );
  }
}

const ScoreLine = ({label, value}) =>
      <span><span>{label}</span><span style={{display: 'inline-block', minWidth: '180px', textAlign: 'right'}}>{value}</span></span>;

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
      return <div style={{position: 'static', width: '100%', height: '100%', backgroundColor: '#000', opacity: '0.3', lineHeight: '500px', verticalAlign: 'middle', fontSize: '40pt'}}>PAUSED</div>;
    } else {
      return <div />;
    }
  }
}

const playAreaStyle = {
  width: 'auto',
  height: 'calc(100% - 50px)',
  display: 'inline-block',
  border: '#aaa ridge 4px',
  borderRadius: '5px',
  backgroundColor: '#000',
  margin: '5px',
  padding: '3px'
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
      blocksImage.src = 'blocks.png';
      blocksImage.onload = () => {
        resolve(blocksImage);
      };
    });
  }

  async init() {
    this.blocks = await this.loadBlocks();
    this.tetris = await Rust.web_tetris;
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

    document.addEventListener("keydown", this.input.bind(this));
    window.requestAnimationFrame(this.tick.bind(this));
    this.tetris.setSpeed(this.level / 20.0);
  }

  tick() {
    if (!this.pause) {
      const update = this.tetris.tick();
      this.updateScore(update.lines);
      if (update.frozen) {
        this.renderBlocks();
        this.renderNextPiece();
      }
      this.renderPieces();
    }

    if (!this.stopping) {
      window.requestAnimationFrame(this.tick.bind(this));
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
          this.tetris.setSpeed(this.level / 20.0);
        } else {
          this.tetris.setSpeed(1);
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
      this.tetris.key(input.key);
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
    for(let x = 0; x < 10; x++) {
      for(let y = 0; y < 20; y++) {
        ctx.drawImage(this.blocks, 7 * 50, 0, 50, 50, x * this.width, y * this.height, this.width, this.height);
      }
    }

    this.backgroundCanvas = canvas;
  }

  renderBlocks() {
    let blocks = this.tetris.getBlocks();
    let canvas = document.createElement("canvas");
    canvas.width = this.width * 10;
    canvas.height = this.height * 20;
    let ctx = canvas.getContext('2d');

    ctx.drawImage(this.backgroundCanvas, 0, 0);

    this.drawBlocks(ctx, blocks);

    this.blocksCanvas = canvas;
  }

  renderPieces() {
    let piece = this.tetris.getActivePiece();
    let dropPiece = this.tetris.getDropPiece();
    this.ctx.drawImage(this.blocksCanvas, 0, 0);

    this.ctx.globalAlpha = 0.33;
    this.drawBlocks(this.ctx, dropPiece);

    this.ctx.globalAlpha = 1;
    this.drawBlocks(this.ctx, piece);
  }

  renderNextPiece() {
    let piece = this.tetris.getNextPiece();
    let canvas = document.createElement("canvas");
    canvas.width = this.width * 5;
    canvas.height = this.height * 5;
    let ctx = canvas.getContext('2d');

    this.drawBlocks(ctx, piece);

    this.trigger("nextPiece", canvas);
  }

  drawBlocks(ctx, blocks) {
    for (let i = 0; i < blocks.data.length; i++) {
      let block = blocks.data[i];
      let offset = this.getSpriteData(block);
      ctx.drawImage(this.blocks, offset * 50, 0, 50, 50, block.point.x * this.width, block.point.y * this.height, this.width, this.height);
    }
  }

  getSpriteData(block) {
    switch(block.piece) {
    case "T":
      return 0;
    case "S":
      return 1;
    case "I":
      return 2;
    case "Z":
      return 3;
    case "L":
      return 4;
    case "J":
      return 5;
    case "O":
      return 6;
    default:
      throw "Invalid Block Type " + block.piece;
    }
  }
}

const tetris = new TetrisGame();

ReactDOM
  .render(<Tetris />, document.getElementById("root"));
