import { describe, it, expect } from 'vitest'
import { ResourceBuilder, createResourceBuilder } from './resources'

describe('ResourceBuilder', () => {
    describe('add', () => {
        it('should add scopes to a resource', () => {
            const builder = new ResourceBuilder()
            builder.add('website', 'site123', ['read', 'write'])

            const resources = builder.build()
            expect(resources['website:site123']).toEqual(['read', 'write'])
        })

        it('should merge scopes when adding to same resource', () => {
            const builder = new ResourceBuilder()
            builder.add('website', 'site123', ['read'])
            builder.add('website', 'site123', ['write'])

            const resources = builder.build()
            expect(resources['website:site123']).toContain('read')
            expect(resources['website:site123']).toContain('write')
        })

        it('should not duplicate scopes', () => {
            const builder = new ResourceBuilder()
            builder.add('website', 'site123', ['read', 'write'])
            builder.add('website', 'site123', ['read', 'delete'])

            const resources = builder.build()
            expect(resources['website:site123']).toEqual(['read', 'write', 'delete'])
        })

        it('should support method chaining', () => {
            const resources = new ResourceBuilder()
                .add('website', 'site123', ['read'])
                .add('project', 'proj456', ['deploy'])
                .build()

            expect(resources['website:site123']).toEqual(['read'])
            expect(resources['project:proj456']).toEqual(['deploy'])
        })
    })

    describe('addOne', () => {
        it('should add a single scope', () => {
            const resources = new ResourceBuilder()
                .addOne('website', 'site123', 'read')
                .build()

            expect(resources['website:site123']).toEqual(['read'])
        })

        it('should work with chaining', () => {
            const resources = new ResourceBuilder()
                .addOne('website', 'site123', 'read')
                .addOne('website', 'site123', 'write')
                .build()

            expect(resources['website:site123']).toContain('read')
            expect(resources['website:site123']).toContain('write')
        })
    })

    describe('addMany', () => {
        it('should add same scopes to multiple resources', () => {
            const resources = new ResourceBuilder()
                .addMany('website', ['site1', 'site2', 'site3'], ['read'])
                .build()

            expect(resources['website:site1']).toEqual(['read'])
            expect(resources['website:site2']).toEqual(['read'])
            expect(resources['website:site3']).toEqual(['read'])
        })

        it('should work with method chaining', () => {
            const resources = new ResourceBuilder()
                .addMany('website', ['site1', 'site2'], ['read'])
                .add('project', 'proj1', ['deploy'])
                .build()

            expect(resources['website:site1']).toEqual(['read'])
            expect(resources['project:proj1']).toEqual(['deploy'])
        })
    })

    describe('remove', () => {
        it('should remove a resource', () => {
            const resources = new ResourceBuilder()
                .add('website', 'site123', ['read'])
                .remove('website', 'site123')
                .build()

            expect(resources['website:site123']).toBeUndefined()
        })

        it('should only remove specified resource', () => {
            const resources = new ResourceBuilder()
                .add('website', 'site1', ['read'])
                .add('website', 'site2', ['write'])
                .remove('website', 'site1')
                .build()

            expect(resources['website:site1']).toBeUndefined()
            expect(resources['website:site2']).toEqual(['write'])
        })
    })

    describe('removeScopes', () => {
        it('should remove specific scopes', () => {
            const resources = new ResourceBuilder()
                .add('website', 'site123', ['read', 'write', 'delete'])
                .removeScopes('website', 'site123', ['write', 'delete'])
                .build()

            expect(resources['website:site123']).toEqual(['read'])
        })

        it('should remove resource if no scopes left', () => {
            const resources = new ResourceBuilder()
                .add('website', 'site123', ['read'])
                .removeScopes('website', 'site123', ['read'])
                .build()

            expect(resources['website:site123']).toBeUndefined()
        })

        it('should handle non-existent resource gracefully', () => {
            const resources = new ResourceBuilder()
                .removeScopes('website', 'site123', ['read'])
                .build()

            expect(resources['website:site123']).toBeUndefined()
        })
    })

    describe('has', () => {
        it('should return true for existing resource', () => {
            const builder = new ResourceBuilder()
            builder.add('website', 'site123', ['read'])

            expect(builder.has('website', 'site123')).toBe(true)
        })

        it('should return false for non-existent resource', () => {
            const builder = new ResourceBuilder()
            expect(builder.has('website', 'site123')).toBe(false)
        })
    })

    describe('get', () => {
        it('should return scopes for a resource', () => {
            const builder = new ResourceBuilder()
            builder.add('website', 'site123', ['read', 'write'])

            expect(builder.get('website', 'site123')).toEqual(['read', 'write'])
        })

        it('should return empty array for non-existent resource', () => {
            const builder = new ResourceBuilder()
            expect(builder.get('website', 'site123')).toEqual([])
        })
    })

    describe('clear', () => {
        it('should clear all resources', () => {
            const resources = new ResourceBuilder()
                .add('website', 'site1', ['read'])
                .add('project', 'proj1', ['deploy'])
                .clear()
                .build()

            expect(Object.keys(resources)).toHaveLength(0)
        })
    })

    describe('from', () => {
        it('should create builder from existing resources', () => {
            const existing = {
                'website:site123': ['read', 'write'],
                'project:proj456': ['deploy']
            }

            const builder = ResourceBuilder.from(existing)
            const resources = builder.build()

            expect(resources).toEqual(existing)
        })

        it('should allow modifications after creation', () => {
            const existing = {
                'website:site123': ['read']
            }

            const resources = ResourceBuilder.from(existing)
                .add('website', 'site123', ['write'])
                .build()

            expect(resources['website:site123']).toContain('read')
            expect(resources['website:site123']).toContain('write')
        })
    })

    describe('createResourceBuilder', () => {
        it('should create a new builder instance', () => {
            const builder = createResourceBuilder()
            expect(builder).toBeInstanceOf(ResourceBuilder)
        })
    })

    describe('complex scenarios', () => {
        it('should handle multiple resource types', () => {
            const resources = new ResourceBuilder()
                .add('website', 'site1', ['analytics:read'])
                .add('project', 'proj1', ['deploy:write'])
                .add('team', 'team1', ['members:invite'])
                .build()

            expect(Object.keys(resources)).toHaveLength(3)
            expect(resources['website:site1']).toEqual(['analytics:read'])
            expect(resources['project:proj1']).toEqual(['deploy:write'])
            expect(resources['team:team1']).toEqual(['members:invite'])
        })

        it('should build immutable result', () => {
            const builder = new ResourceBuilder()
                .add('website', 'site1', ['read'])

            const resources1 = builder.build()
            builder.add('website', 'site2', ['write'])
            const resources2 = builder.build()

            // First build should not be affected
            expect(Object.keys(resources1)).toHaveLength(1)
            expect(Object.keys(resources2)).toHaveLength(2)
        })
    })
})

