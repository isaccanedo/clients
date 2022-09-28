export enum StateVersion {
  One = 1, // Original flat key/value pair store
  Two = 2, // Move to a typed State object
  Three = 3, // Fix migration of users' premium status
  Four = 4, // Fix 'Never Lock' option by removing stale data
  Five = 5, // Migrate to new storage of encrypted organization keys
  Six = 6, // Delete account.keys.legacyEtmKey property
  Latest = Six,
}
