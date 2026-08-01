/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BioDataForm from '@/components/BioDataForm';

jest.mock('@/lib/upload-client', () => ({
  uploadFile: jest.fn(),
}));

import { uploadFile } from '@/lib/upload-client';

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
    expect(screen.getByLabelText('Tribe')).toBeInTheDocument();
    expect(screen.getByLabelText('Ethnicity')).toBeInTheDocument();
    // Profile photo
    expect(screen.getByLabelText('Upload profile photo')).toBeInTheDocument();
    // Chronic disease sub-fields
    expect(screen.getByLabelText('Condition (disease)')).toBeInTheDocument();
    expect(screen.getByLabelText('Duration')).toBeInTheDocument();
    expect(screen.getByLabelText('Progression')).toBeInTheDocument();
    expect(screen.getByLabelText('Complication')).toBeInTheDocument();
    expect(screen.getByLabelText('Care')).toBeInTheDocument();
    expect(screen.getByLabelText('Cause / notes')).toBeInTheDocument();
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

  it('includes tribe and ethnicity in the saved biodata payload', async () => {
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
    fireEvent.change(screen.getByLabelText('Tribe'), { target: { value: 'Igbo' } });
    fireEvent.change(screen.getByLabelText('Ethnicity'), { target: { value: 'Igbo' } });
    fireEvent.click(screen.getByText('Save biodata'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [, savedBiodata] = onSave.mock.calls[0];
    expect(savedBiodata).toMatchObject({ tribe: 'Igbo', ethnicity: 'Igbo' });
  });

  it('uploads a profile photo and includes profile_photo_url in the saved payload', async () => {
    (uploadFile as jest.Mock).mockResolvedValue('https://storage.test/profile.png');
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
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Upload profile photo'), { target: { files: [file] } });
    await waitFor(() => expect(uploadFile).toHaveBeenCalledWith(file));
    await screen.findByAltText('Profile');

    fireEvent.click(screen.getByText('Save biodata'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [savedProfile] = onSave.mock.calls[0];
    expect(savedProfile).toMatchObject({ profile_photo_url: 'https://storage.test/profile.png' });
  });

  it('pre-fills the profile photo from initialProfile and allows removing it', () => {
    render(
      <BioDataForm
        initialProfile={{ profile_photo_url: 'https://storage.test/existing.png' }}
        initialBiodata={{}}
        onSave={jest.fn()}
      />,
    );
    expect(screen.getByAltText('Profile')).toHaveAttribute('src', 'https://storage.test/existing.png');
    fireEvent.click(screen.getByText('Remove photo'));
    expect(screen.queryByAltText('Profile')).not.toBeInTheDocument();
  });

  it('removing the photo only hides it on this form — it does not clear the stored value server-side', async () => {
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
          profile_photo_url: 'https://storage.test/existing.png',
        }}
        initialBiodata={{}}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText('Remove photo'));
    fireEvent.click(screen.getByText('Save biodata'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [savedProfile] = onSave.mock.calls[0];
    // `onSave` receives the raw object pre-serialization, so the key can
    // still be present here with an `undefined` value — the actual "leave
    // server data untouched" behavior comes from JSON.stringify dropping an
    // `undefined`-valued key once DashboardClient builds the PATCH body.
    // Asserting `undefined` (not `null`) here is what guarantees that drop.
    expect(savedProfile.profile_photo_url).toBeUndefined();
  });

  it('adds a clinical condition with the chronic-disease sub-fields in the saved payload', async () => {
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
    fireEvent.change(screen.getByLabelText('Condition (disease)'), {
      target: { value: 'Hypertension' },
    });
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '3 years' } });
    fireEvent.change(screen.getByLabelText('Progression'), { target: { value: 'Stable' } });
    fireEvent.change(screen.getByLabelText('Complication'), { target: { value: 'None' } });
    fireEvent.change(screen.getByLabelText('Care'), { target: { value: 'Daily medication' } });
    fireEvent.change(screen.getByLabelText('Cause / notes'), { target: { value: 'Family history' } });
    fireEvent.click(screen.getByText('Add condition'));

    fireEvent.click(screen.getByText('Save biodata'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [, savedBiodata] = onSave.mock.calls[0];
    expect(savedBiodata.clinical_conditions).toHaveLength(1);
    expect(savedBiodata.clinical_conditions[0]).toMatchObject({
      condition: 'Hypertension',
      duration: '3 years',
      progression: 'Stable',
      complication: 'None',
      care: 'Daily medication',
      cause: 'Family history',
    });
  });

  it('shows the BMI formula and reveals the ranges explainer on click', () => {
    render(<BioDataForm initialProfile={{}} initialBiodata={{}} onSave={jest.fn()} />);
    expect(screen.getByText(/BMI = weight \(kg\) ÷ height \(m\)²/)).toBeInTheDocument();
    const summary = screen.getByText('What do BMI ranges mean?');
    expect(screen.queryByText(/Below 18.5: Underweight/)).not.toBeVisible();
    fireEvent.click(summary);
    expect(screen.getByText(/Below 18.5: Underweight/)).toBeVisible();
  });

  it('reveals the genotype/blood group explainer on click', () => {
    render(<BioDataForm initialProfile={{}} initialBiodata={{}} onSave={jest.fn()} />);
    const summary = screen.getByText('What are genotype and blood group, and why do they matter?');
    expect(screen.queryByText(/haemoglobin genes/)).not.toBeVisible();
    fireEvent.click(summary);
    expect(screen.getByText(/haemoglobin genes/)).toBeVisible();
  });
});
