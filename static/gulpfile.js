const gulp = require('gulp');
const babel = require('gulp-babel');
const browserify = require('browserify');
const babelify =  require('babelify');

const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');

gulp.task('scripts', () => {
  const bundler = browserify({
    entries: 'tetris.jsx',
    transform: [babelify]
  });
  bundler.bundle()
    .pipe(source('tetris.js'))
    .pipe(buffer())
    .pipe(gulp.dest('app'));
});

gulp.task('default', ['scripts']);
