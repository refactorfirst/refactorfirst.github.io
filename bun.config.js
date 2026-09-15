export default {
  test: {
    environment: 'jsdom',
    coverage: {
      reporter: ['text', 'html'],
      include: ['js/**/*.js'],
      exclude: ['tests/']
    }
  }
};