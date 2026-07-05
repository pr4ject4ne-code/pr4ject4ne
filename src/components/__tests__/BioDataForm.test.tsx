/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BioDataForm from '@/components/BioDataForm';

describe('BioDataForm', () => {
  it('renders all Profile and Biodata layer fields', () => {
    render(<BioDataForm initialProfile={{}} initialBiodata={{}} onSave={jest.fn()} />);
    // Profile layer
    expect(screen.getByLabelText('Full name *')).toBeInTheDocument();
    expect(screen.getByLabelText('Alias')).toBeInTheDocument();
    expect(screen.getByLabelText('Gender *')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone *')).toBeInTheDocument();
    expect(screen.getByLabelText('Email *')).toBeInTheDocument();
    expect(screen.getByLabelText('Date of birth *')).toBeInTheDocument();
    expect(screen.getByLabelText('Next of kin contact *')).toBeInTheDocument();
    expect(screen.getByLabelText('Address')).toBeInTheDocument();
    // Biodata layer
    expect(screen.getByLabelText('Chronic disease')).toBeInTheDocument();
    expect(screen.getByLabelText('Height (cm)')).toBeInTheDocument();
    expect(screen.getByLabelText('BMI (calculated)')).toBeInTheDocument();
    expect(screen.getByLabelText('Genotype')).toBeInTheDocument();
    expect(screen.getByLabelText('Blood group')).toBeInTheDocument();
  });

  it('blocks save and shows errors when required fields are empty', async () => {
    const onSave = jest.fn();
    render(<BioDataForm initialProfile={{}} initialBiodata={{}} onSave={onSave} />);
    fireEvent.click(screen.getByText('Save biodata'));
    expect(await screen.findByText('Full name is required.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calculates BMI from height and weight', () => {
    render(
      <BioDataForm
        initialProfile={{}}
        initialBiodata={{ height_cm: 180, weight_kg: 81 }}
        onSave={jest.fn()}
      />,
    );
    // 81 / (1.8^2) = 25.0
    expect(screen.getByLabelText('BMI (calculated)')).toHaveValue('25');
  });

  it('saves when all required fields are filled', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(
      <BioDataForm
        initialProfile={{
          full_name: 'Ada Obi',
          gender: 'female',
          phone: '0800',
          email: 'a@b.co',
          dob: '1990-01-01',
          next_of_kin: 'Kin 0800',
        }}
        initialBiodata={{}}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText('Save biodata'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });
});
