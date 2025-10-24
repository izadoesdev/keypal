# Storage Adapter Test Requirements

This document outlines all features that must be implemented and tested for each storage adapter.

## Core Storage Interface

### Essential CRUD Operations

- [ ] **save()** - Persist a complete API key record
  - Saves all metadata fields correctly
  - Handles concurrent saves
  - Returns without errors on success

- [ ] **findByHash()** - Lookup by key hash
  - Returns correct record when exists
  - Returns null when not found
  - Uses indexed query for performance
  - Returns exact hash match only

- [ ] **findById()** - Lookup by record ID
  - Returns correct record when exists
  - Returns null when not found
  - Uses primary key lookup

- [ ] **findByOwner()** - Find all keys for an owner
  - Returns all keys for given ownerId
  - Returns empty array when none exist
  - Does not return keys from other owners
  - Handles JSONB/metadata queries correctly

- [ ] **updateMetadata()** - Partial metadata updates
  - Updates single field correctly
  - Merges with existing metadata
  - Preserves unchanged fields
  - Throws error if key not found
  - Atomically updates entire metadata object

- [ ] **delete()** - Single record deletion
  - Removes record from storage
  - No error if already deleted
  - Does not affect other records

- [ ] **deleteByOwner()** - Bulk deletion by owner
  - Deletes all keys for given owner
  - Does not delete keys from other owners
  - Returns without error when none exist

## Metadata Field Support

### Basic Fields

- [ ] **ownerId** (required) - Owner identifier
  - Required field validation
  - String storage and retrieval
  - Querying by ownerId works

- [ ] **name** (optional) - Human-readable name
  - Can be null/undefined
  - Preserves special characters
  - Updates correctly

- [ ] **description** (optional) - Key description
  - Can be null/undefined
  - Supports multi-line text
  - Updates correctly

### Permissions & Scopes

- [ ] **scopes** (optional) - Permission scopes array
  - Empty array []
  - Single scope ["read"]
  - Multiple scopes ["read", "write", "admin"]
  - Null/undefined handling
  - Preserves order
  - Updates correctly (add/remove scopes)

- [ ] **resources** (optional) - Resource-specific permissions
  - Empty object {}
  - Single resource { "project:123": ["read"] }
  - Multiple resources { "project:123": ["read"], "project:456": ["write"] }
  - Nested structures preserved
  - Updates correctly

### Status & Lifecycle

- [ ] **enabled** (optional) - Enable/disable flag
  - Defaults to true
  - Boolean storage
  - Updates correctly
  - Toggle works

- [ ] **revokedAt** (optional) - Revocation timestamp
  - ISO string timestamp
  - Null when not revoked
  - Queries work correctly

- [ ] **rotatedTo** (optional) - Key rotation reference
  - ID of replacement key
  - Null when not rotated
  - Updates correctly

### Timestamps

- [ ] **createdAt** (optional) - Creation timestamp
  - ISO string format
  - Preserves precision
  - Auto-populated on create

- [ ] **lastUsedAt** (optional) - Last usage timestamp
  - ISO string format
  - Null when never used
  - Updates correctly

- [ ] **expiresAt** (optional) - Expiration timestamp
  - ISO string format
  - Null for never-expiring keys
  - Date range queries work

## Data Type Handling

### Basic Types

- [ ] **Strings** - Text fields
  - Unicode support
  - Empty strings
  - Very long strings
  - Special characters

- [ ] **Numbers** - Not used directly (timestamps are strings)
  - N/A for current schema

- [ ] **Booleans** - True/false values
  - Explicit true/false
  - Default handling

- [ ] **Null values** - Optional fields
  - Stored as null
  - Differentiated from undefined
  - Queries handle null correctly

- [ ] **Undefined** - Missing fields
  - Treated as optional
  - Not stored explicitly
  - Retrieval returns undefined

### Arrays

- [ ] **Array storage** - Scopes arrays
  - Empty arrays
  - Large arrays (10+ items)
  - Order preservation
  - Duplicate handling

### Objects/JSON

- [ ] **JSON object storage** - Resources and metadata
  - Nested objects
  - Empty objects
  - Deep nesting
  - Key preservation
  - Value types within objects

## Edge Cases

### Empty Data

- [ ] Empty ownerId (should fail validation upstream)
- [ ] Empty scopes array []
- [ ] Empty resources object {}
- [ ] Empty strings in text fields

### Large Data

- [ ] Many scopes (20+ items)
- [ ] Large resource objects
- [ ] Very long description text
- [ ] Many keys per owner (100+)

### Concurrent Operations

- [ ] Concurrent saves
- [ ] Concurrent updates
- [ ] Concurrent deletes
- [ ] Read during write

### Error Handling

- [ ] Invalid data types
- [ ] Missing required fields
- [ ] Update non-existent key
- [ ] Delete non-existent key
- [ ] Connection failures

## Query Operations

### Single Key Lookups

- [ ] findByHash returns correct record
- [ ] findById returns correct record
- [ ] Returns null for non-existent

### Multi-Key Lookups

- [ ] findByOwner returns all matching keys
- [ ] Returns correct count
- [ ] Does not include other owners
- [ ] Sorted/unsorted handling

### Updates

- [ ] updateMetadata preserves existing data
- [ ] updateMetadata merges new data
- [ ] updateMetadata replaces conflicting fields
- [ ] Atomic updates (no partial writes)

## Performance Characteristics

### Query Performance

- [ ] findByHash uses index (fast)
- [ ] findById uses primary key (fast)
- [ ] findByOwner query is efficient
- [ ] Large dataset handling (1000+ keys)

### Storage Efficiency

- [ ] No data duplication
- [ ] Efficient metadata storage
- [ ] Proper indexing strategy

## Integration Points

### With ApiKeyManager

- [ ] Manager can create keys
- [ ] Manager can verify keys
- [ ] Manager can list keys
- [ ] Manager can update keys
- [ ] Manager can delete keys
- [ ] Manager can rotate keys
- [ ] Manager can revoke keys

### With Caching Layer

- [ ] Cache works with storage
- [ ] Cache invalidation on updates
- [ ] Cache invalidation on deletes

## Drizzle-Specific Features

### JSONB Queries

- [ ] Metadata queries work correctly
- [ ] arrayContains works for owner lookup
- [ ] JSONB indexes used efficiently
- [ ] Nested field queries
- [ ] String-to-JSON parsing works

### Database Constraints

- [ ] Primary key constraint enforced
- [ ] NOT NULL constraints enforced
- [ ] Index usage verified
- [ ] Foreign key handling (if applicable)

### SQL Injection Prevention

- [ ] Parameterized queries used
- [ ] User input sanitized
- [ ] SQL injection attempts fail safely

## Documentation & Examples

- [ ] README with usage examples
- [ ] TypeScript type definitions
- [ ] Error message clarity
- [ ] Migration/setup instructions

## Test Coverage Requirements

### Unit Tests

- [ ] All Storage interface methods tested
- [ ] Edge cases covered
- [ ] Error cases covered
- [ ] Mock-based tests (if applicable)

### Integration Tests

- [ ] Real database tests
- [ ] With actual Drizzle instance
- [ ] Clean up after tests
- [ ] Concurrent operations tested

### Performance Tests

- [ ] Benchmark against other adapters
- [ ] Large dataset performance
- [ ] Query optimization verified

## Checklist Summary

Total features: **87**
- Core Storage: 7 operations
- Metadata Fields: 11 fields with various scenarios
- Data Types: 8 type handling scenarios
- Edge Cases: 10 edge case categories
- Query Operations: 6 query patterns
- Performance: 7 performance characteristics
- Integration: 7 integration points
- Drizzle-Specific: 8 database-specific features
- Documentation: 4 documentation items
- Test Coverage: 12 test categories

