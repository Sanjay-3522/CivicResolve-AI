import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import LocationPicker from '../components/LocationPicker'
import { created } from '../__mocks__/leaflet'

describe('LocationPicker', () => {
  beforeEach(() => {
    created.maps.length = 0
    created.markers.length = 0
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ display_name: 'MG Road, Shanthala Nagar, Bengaluru, Karnataka, India' }),
    }) as unknown as typeof fetch
  })

  it('applies keyboard-entered coordinates and reverse-geocodes the address', async () => {
    const onSelect = jest.fn()
    render(<LocationPicker onLocationSelect={onSelect} />)
    fireEvent.change(screen.getByLabelText('Latitude coordinate'), { target: { value: '12.9' } })
    fireEvent.change(screen.getByLabelText('Longitude coordinate'), { target: { value: '77.6' } })
    fireEvent.click(screen.getByRole('button', { name: /Use these manual coordinates/ }))
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith({ lat: 12.9, lon: 77.6, address: 'MG Road,  Shanthala Nagar,  Bengaluru' }),
    )
    expect(screen.getByText(/Location selected: 12.9000, 77.6000/)).toBeInTheDocument()
    expect(created.markers).toHaveLength(1)
  })

  it('rejects out-of-range coordinates with an error message', () => {
    const onSelect = jest.fn()
    render(<LocationPicker onLocationSelect={onSelect} />)
    fireEvent.change(screen.getByLabelText('Latitude coordinate'), { target: { value: '95' } })
    fireEvent.keyDown(screen.getByLabelText('Latitude coordinate'), { key: 'Enter' })
    expect(screen.getByText('Error: Latitude must be between -90 and 90')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Latitude coordinate'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Longitude coordinate'), { target: { value: '200' } })
    fireEvent.keyDown(screen.getByLabelText('Longitude coordinate'), { key: 'Enter' })
    expect(screen.getByText('Error: Longitude must be between -180 and 180')).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('selects a location from a map click and still works if geocoding fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    const onSelect = jest.fn()
    render(<LocationPicker onLocationSelect={onSelect} />)
    await act(async () => created.maps[0].fire('click', { latlng: { lat: 1.5, lng: 2.5 } }))
    await act(async () => created.maps[0].fire('click', { latlng: { lat: 1.6, lng: 2.6 } }))
    expect(onSelect).toHaveBeenLastCalledWith({ lat: 1.6, lon: 2.6, address: undefined })
    expect(created.markers).toHaveLength(1) // marker is moved, not duplicated
  })
})
