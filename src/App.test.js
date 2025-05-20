import { render, screen } from '@testing-library/react';
import App from './App';

test('renders main title', () => {
  render(<App />);
  const title = screen.getByTestId('main-title');
  expect(title).toHaveTextContent(/exam helper/i);
});

