import { describe, expect, it } from "vitest";
import {
  hasAllScopes,
  hasAllScopesWithResources,
  hasAnyScope,
  hasAnyScopeWithResources,
  hasScope,
  hasScopeWithResources,
} from "./scopes";

describe("scopes (basic)", () => {
  describe("hasScope", () => {
    it("should return true when scope exists", () => {
      expect(hasScope(["read", "write"], "read")).toBe(true);
    });

    it("should return false when scope does not exist", () => {
      expect(hasScope(["read"], "write")).toBe(false);
    });

    it("should return false when scopes is undefined", () => {
      expect(hasScope(undefined, "read")).toBe(false);
    });
  });

  describe("hasAnyScope", () => {
    it("should return true when any scope exists", () => {
      expect(hasAnyScope(["read", "write"], ["delete", "write"])).toBe(true);
    });

    it("should return false when no scope exists", () => {
      expect(hasAnyScope(["read"], ["write", "delete"])).toBe(false);
    });

    it("should return false when scopes is undefined", () => {
      expect(hasAnyScope(undefined, ["read", "write"])).toBe(false);
    });
  });

  describe("hasAllScopes", () => {
    it("should return true when all scopes exist", () => {
      expect(hasAllScopes(["read", "write", "delete"], ["read", "write"])).toBe(
        true
      );
    });

    it("should return false when some scopes are missing", () => {
      expect(hasAllScopes(["read"], ["read", "write"])).toBe(false);
    });

    it("should return false when scopes is undefined", () => {
      expect(hasAllScopes(undefined, ["read", "write"])).toBe(false);
    });
  });
});

describe("scopes (with resources)", () => {
  describe("hasScopeWithResources", () => {
    it("should check global scopes", () => {
      expect(hasScopeWithResources(["read", "write"], undefined, "read")).toBe(
        true
      );
      expect(hasScopeWithResources(["read"], undefined, "write")).toBe(false);
    });

    it("should check resource-specific scopes", () => {
      const resources = {
        "website:123": ["analytics:read", "analytics:write"],
        "website:456": ["analytics:read"],
      };

      expect(
        hasScopeWithResources([], resources, "analytics:write", {
          resource: "website:123",
        })
      ).toBe(true);
      expect(
        hasScopeWithResources([], resources, "analytics:write", {
          resource: "website:456",
        })
      ).toBe(false);
    });

    it("should prioritize global scopes over resource scopes", () => {
      const resources = {
        "website:123": ["analytics:read"],
      };

      expect(
        hasScopeWithResources(["analytics:read"], resources, "analytics:read")
      ).toBe(true);
      expect(
        hasScopeWithResources(["analytics:read"], resources, "analytics:read", {
          resource: "website:456",
        })
      ).toBe(true);
    });

    it("should return false when resource does not exist", () => {
      const resources = {
        "website:123": ["analytics:read"],
      };

      expect(
        hasScopeWithResources([], resources, "analytics:read", {
          resource: "website:456",
        })
      ).toBe(false);
    });

    it("should handle undefined resources", () => {
      expect(
        hasScopeWithResources(["read"], undefined, "read", {
          resource: "website:123",
        })
      ).toBe(true);
      expect(
        hasScopeWithResources([], undefined, "read", {
          resource: "website:123",
        })
      ).toBe(false);
    });
  });

  describe("hasAnyScopeWithResources", () => {
    it("should check global scopes", () => {
      expect(
        hasAnyScopeWithResources(["read", "write"], undefined, [
          "delete",
          "write",
        ])
      ).toBe(true);
      expect(
        hasAnyScopeWithResources(["read"], undefined, ["write", "delete"])
      ).toBe(false);
    });

    it("should check resource-specific scopes", () => {
      const resources = {
        "website:123": ["analytics:read", "analytics:write"],
        "website:456": ["analytics:read"],
      };

      expect(
        hasAnyScopeWithResources(
          [],
          resources,
          ["analytics:write", "analytics:delete"],
          { resource: "website:123" }
        )
      ).toBe(true);
      expect(
        hasAnyScopeWithResources(
          [],
          resources,
          ["analytics:write", "analytics:delete"],
          { resource: "website:456" }
        )
      ).toBe(false);
    });

    it("should combine global and resource scopes", () => {
      const resources = {
        "website:123": ["analytics:write"],
      };

      expect(
        hasAnyScopeWithResources(
          ["analytics:read"],
          resources,
          ["analytics:read", "analytics:delete"],
          { resource: "website:456" }
        )
      ).toBe(true);
      expect(
        hasAnyScopeWithResources(
          ["analytics:read"],
          resources,
          ["analytics:write", "analytics:delete"],
          { resource: "website:123" }
        )
      ).toBe(true);
    });
  });

  describe("hasAllScopesWithResources", () => {
    it("should check global scopes", () => {
      expect(
        hasAllScopesWithResources(["read", "write", "delete"], undefined, [
          "read",
          "write",
        ])
      ).toBe(true);
      expect(
        hasAllScopesWithResources(["read"], undefined, ["read", "write"])
      ).toBe(false);
    });

    it("should check resource-specific scopes", () => {
      const resources = {
        "website:123": ["analytics:read", "analytics:write"],
        "website:456": ["analytics:read"],
      };

      expect(
        hasAllScopesWithResources(
          [],
          resources,
          ["analytics:read", "analytics:write"],
          { resource: "website:123" }
        )
      ).toBe(true);
      expect(
        hasAllScopesWithResources(
          [],
          resources,
          ["analytics:read", "analytics:write"],
          { resource: "website:456" }
        )
      ).toBe(false);
    });

    it("should combine global and resource scopes when checking all", () => {
      const resources = {
        "website:123": ["analytics:write"],
      };

      // Global has 'read', resource has 'write'
      expect(
        hasAllScopesWithResources(
          ["analytics:read"],
          resources,
          ["analytics:read", "analytics:write"],
          { resource: "website:123" }
        )
      ).toBe(true);

      // Global has 'read', resource doesn't have 'write'
      expect(
        hasAllScopesWithResources(
          ["analytics:read"],
          resources,
          ["analytics:read", "analytics:write"],
          { resource: "website:456" }
        )
      ).toBe(false);
    });

    it("should return true if all scopes are in global", () => {
      const resources = {
        "website:123": ["analytics:write"],
      };

      expect(
        hasAllScopesWithResources(
          ["analytics:read", "analytics:write"],
          resources,
          ["analytics:read", "analytics:write"],
          { resource: "website:456" }
        )
      ).toBe(true);
    });
  });

  describe("complex scenarios", () => {
    it("should handle multiple resource types", () => {
      const resources = {
        "website:123": ["analytics:read"],
        "project:456": ["deploy:write"],
        "team:789": ["members:invite"],
      };

      expect(
        hasScopeWithResources([], resources, "analytics:read", {
          resource: "website:123",
        })
      ).toBe(true);
      expect(
        hasScopeWithResources([], resources, "deploy:write", {
          resource: "project:456",
        })
      ).toBe(true);
      expect(
        hasScopeWithResources([], resources, "members:invite", {
          resource: "team:789",
        })
      ).toBe(true);
      expect(
        hasScopeWithResources([], resources, "analytics:read", {
          resource: "project:456",
        })
      ).toBe(false);
    });

    it("should handle empty resource scopes arrays", () => {
      const resources = {
        "website:123": [],
      };

      expect(
        hasScopeWithResources([], resources, "read", {
          resource: "website:123",
        })
      ).toBe(false);
    });

    it("should return false when resource is not provided in options", () => {
      const resources = {
        "website:123": ["read"],
      };

      expect(hasScopeWithResources([], resources, "read", {})).toBe(false);
      expect(hasScopeWithResources([], resources, "read")).toBe(false);
    });

    it("should return false when resource is not provided in hasAllScopesWithResources", () => {
      const resources = {
        "website:123": ["read", "write"],
      };

      expect(
        hasAllScopesWithResources([], resources, ["read", "write"], {})
      ).toBe(false);
      expect(hasAllScopesWithResources([], resources, ["read", "write"])).toBe(
        false
      );
    });
  });
});
