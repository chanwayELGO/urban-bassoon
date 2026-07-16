export const detectPlatform = (ref) => {
  const r = ref.toUpperCase().trim()
  if (/^HM[A-Z0-9]{8,10}$/.test(r)) return "airbnb"
  if (/^\d{9,10}$/.test(r)) return "booking"
  if (/^[A-Z]{2}\d{6,8}$/.test(r)) return "expedia"
  if (/^[A-Z0-9]{6}$/.test(r)) return "pnr"
  if (/^[A-Z0-9]{8,12}$/.test(r)) return "hotels"
  return "generic"
}

export const platformLinks = (ref, platform) => {
  const enc = encodeURIComponent(ref)
  const base = [
    {
      label: "Booking.com",
      url: `https://secure.booking.com/myreservations.html?lang=en`,
      icon: "🏨",
      sub: "Manage reservation",
    },
    { label: "Expedia", url: `https://expedia.com/trips`, icon: "✈️", sub: "My trips" },
    { label: "Airbnb", url: `https://airbnb.com/trips/v1`, icon: "🏠", sub: "Your trips" },
    { label: "Hotels.com", url: `https://hotels.com/my-trips`, icon: "🛎️", sub: "Manage booking" },
    {
      label: "Agoda",
      url: `https://agoda.com/en-us/account/manage`,
      icon: "🌏",
      sub: "My bookings",
    },
    {
      label: "Google",
      url: `https://www.google.com/search?q=${enc}+hotel+booking`,
      icon: "🔍",
      sub: "Search reference",
    },
  ]
  if (platform === "airbnb") return [base[2], base[5], ...base.slice(0, 2)]
  if (platform === "booking") return [base[0], base[5], base[1], base[3]]
  if (platform === "expedia") return [base[1], base[5], base[0], base[2]]
  return base
}
