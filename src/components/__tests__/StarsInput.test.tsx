/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StarsInput from '@/components/StarsInput';

describe('StarsInput', () => {
  it('renders five accessible, labeled star buttons', () => {
    render(<StarsInput value={0} onSelect={jest.fn()} />);
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByLabelText(`Rate ${i} star${i === 1 ? '' : 's'}`)).toBeInTheDocument();
    }
  });

  it('calls onSelect with the clicked score', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    render(<StarsInput value={0} onSelect={onSelect} />);
    await user.click(screen.getByLabelText('Rate 4 stars'));
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it('supports keyboard activation (Enter) on a focused star', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    render(<StarsInput value={0} onSelect={onSelect} />);
    const star3 = screen.getByLabelText('Rate 3 stars');
    act(() => star3.focus());
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('supports keyboard activation (Space) on a focused star', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    render(<StarsInput value={0} onSelect={onSelect} />);
    const star2 = screen.getByLabelText('Rate 2 stars');
    act(() => star2.focus());
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('does not call onSelect when disabled and prevents interaction', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    render(<StarsInput value={0} onSelect={onSelect} disabled />);
    const star5 = screen.getByLabelText('Rate 5 stars');
    expect(star5).toBeDisabled();
    await user.click(star5);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
