# signal-studio engine API

> Generated from `apps/api/src/app.ts`'s real Hono route definitions via
> `@hono/zod-openapi`'s `app.doc()` — regenerate with
> `node --experimental-strip-types apps/api/scripts/generate-docs.mjs`
> whenever a route changes. Don't hand-edit the JSON block below.

All routes except `GET /health` and `GET /openapi.json` itself require
`Authorization: Bearer <api-key>` (see `src/middleware/api-key.ts`).

| Method | Path                  | Responses     |
| ------ | --------------------- | ------------- |
| `GET`  | `/health`             | 200           |
| `POST` | `/jobs`               | 201, 404      |
| `GET`  | `/jobs`               | 200, 404      |
| `GET`  | `/jobs/{id}`          | 200, 404      |
| `POST` | `/jobs/{id}/assets`   | 200, 404      |
| `POST` | `/jobs/{id}/approve`  | 200, 400, 404 |
| `POST` | `/jobs/{id}/dispatch` | 200, 400, 404 |

## Full OpenAPI 3.0 document

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "signal-studio engine API",
    "version": "0.1.0"
  },
  "components": {
    "schemas": {},
    "parameters": {}
  },
  "paths": {
    "/health": {
      "get": {
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "enum": ["ok"]
                    }
                  },
                  "required": ["status"]
                }
              }
            }
          }
        }
      }
    },
    "/jobs": {
      "post": {
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "projectSlug": {
                    "type": "string",
                    "minLength": 1
                  },
                  "manifest": {
                    "type": "object",
                    "properties": {
                      "version": {
                        "type": "string",
                        "enum": ["1"]
                      },
                      "projectRef": {
                        "type": "string",
                        "minLength": 1
                      },
                      "template": {
                        "type": "string",
                        "minLength": 1
                      },
                      "inputs": {
                        "type": "object",
                        "properties": {
                          "jobs": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "properties": {
                                "kind": {
                                  "type": "string"
                                },
                                "ref": {
                                  "type": "string"
                                }
                              },
                              "required": ["kind", "ref"]
                            },
                            "default": []
                          }
                        },
                        "default": {
                          "jobs": []
                        }
                      },
                      "shots": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "id": {
                              "type": "string",
                              "minLength": 1
                            },
                            "text": {
                              "type": "string"
                            },
                            "image": {
                              "type": "string"
                            },
                            "clip": {
                              "type": "string"
                            },
                            "trim_in_s": {
                              "type": "number",
                              "minimum": 0,
                              "default": 0
                            },
                            "speed": {
                              "type": "number",
                              "minimum": 0.25,
                              "maximum": 4,
                              "default": 1
                            },
                            "overlay_text": {
                              "type": "string",
                              "minLength": 1,
                              "maxLength": 120
                            },
                            "overlay_in_s": {
                              "type": "number",
                              "minimum": 0,
                              "default": 0.4
                            },
                            "overlay_out_s": {
                              "type": "number",
                              "minimum": 0
                            },
                            "voiceover_text": {
                              "type": "string",
                              "minLength": 1
                            },
                            "ig_optional": {
                              "type": "boolean",
                              "default": false
                            },
                            "audio": {
                              "type": "object",
                              "properties": {
                                "strip_native_audio": {
                                  "type": "boolean",
                                  "default": false
                                },
                                "keep_native_sfx": {
                                  "type": "boolean",
                                  "default": true
                                }
                              },
                              "default": {
                                "strip_native_audio": false,
                                "keep_native_sfx": true
                              }
                            },
                            "fact_confidence": {
                              "type": "string",
                              "enum": ["high", "medium", "low"]
                            },
                            "verify": {
                              "type": "string"
                            }
                          },
                          "required": ["id"]
                        },
                        "minItems": 1,
                        "maxItems": 6
                      },
                      "visual": {
                        "type": "object",
                        "properties": {
                          "mode": {
                            "type": "string"
                          }
                        },
                        "required": ["mode"]
                      },
                      "audio": {
                        "type": "object",
                        "properties": {
                          "voice": {
                            "type": "string",
                            "default": "bm_george"
                          },
                          "speed": {
                            "type": "number",
                            "minimum": 0.5,
                            "maximum": 2,
                            "default": 1
                          },
                          "music": {
                            "type": "object",
                            "properties": {
                              "file": {
                                "type": "string"
                              },
                              "mood": {
                                "type": "string"
                              },
                              "gain_db": {
                                "type": "number",
                                "default": -18
                              },
                              "duck": {
                                "type": "boolean",
                                "default": true
                              }
                            },
                            "default": {
                              "gain_db": -18,
                              "duck": true
                            }
                          }
                        },
                        "default": {
                          "voice": "bm_george",
                          "speed": 1,
                          "music": {
                            "gain_db": -18,
                            "duck": true
                          }
                        }
                      },
                      "end_card": {
                        "type": "object",
                        "properties": {
                          "subject": {
                            "type": "string",
                            "minLength": 1
                          },
                          "disclosure": {
                            "type": "string",
                            "minLength": 1
                          }
                        },
                        "required": ["subject", "disclosure"]
                      },
                      "watermark": {
                        "type": "object",
                        "properties": {
                          "text": {
                            "type": "string",
                            "default": "AI visualisation"
                          }
                        },
                        "default": {
                          "text": "AI visualisation"
                        }
                      },
                      "outputs": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        },
                        "minItems": 1
                      },
                      "captions": {
                        "type": "object",
                        "properties": {
                          "facebook": {
                            "type": "string"
                          },
                          "facebook_question": {
                            "type": "string"
                          },
                          "instagram": {
                            "type": "string"
                          },
                          "youtube_shorts_title": {
                            "type": "string"
                          },
                          "hashtags_facebook": {
                            "type": "array",
                            "items": {
                              "type": "string"
                            },
                            "default": []
                          },
                          "hashtags_instagram": {
                            "type": "array",
                            "items": {
                              "type": "string"
                            },
                            "default": []
                          }
                        },
                        "default": {}
                      },
                      "disclosure": {
                        "type": "boolean",
                        "default": true
                      },
                      "gates": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        },
                        "default": []
                      },
                      "publish": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        },
                        "default": []
                      },
                      "compilationTargetS": {
                        "type": "number",
                        "minimum": 0,
                        "exclusiveMinimum": true
                      }
                    },
                    "required": [
                      "version",
                      "projectRef",
                      "template",
                      "shots",
                      "visual",
                      "end_card",
                      "outputs"
                    ]
                  }
                },
                "required": ["projectSlug", "manifest"]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Job created",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "org_id": {
                      "type": "string"
                    },
                    "project_id": {
                      "type": "string"
                    },
                    "manifest": {
                      "type": "object",
                      "properties": {
                        "version": {
                          "type": "string",
                          "enum": ["1"]
                        },
                        "projectRef": {
                          "type": "string",
                          "minLength": 1
                        },
                        "template": {
                          "type": "string",
                          "minLength": 1
                        },
                        "inputs": {
                          "type": "object",
                          "properties": {
                            "jobs": {
                              "type": "array",
                              "items": {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "type": "string"
                                  },
                                  "ref": {
                                    "type": "string"
                                  }
                                },
                                "required": ["kind", "ref"]
                              },
                              "default": []
                            }
                          },
                          "default": {
                            "jobs": []
                          }
                        },
                        "shots": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "properties": {
                              "id": {
                                "type": "string",
                                "minLength": 1
                              },
                              "text": {
                                "type": "string"
                              },
                              "image": {
                                "type": "string"
                              },
                              "clip": {
                                "type": "string"
                              },
                              "trim_in_s": {
                                "type": "number",
                                "minimum": 0,
                                "default": 0
                              },
                              "speed": {
                                "type": "number",
                                "minimum": 0.25,
                                "maximum": 4,
                                "default": 1
                              },
                              "overlay_text": {
                                "type": "string",
                                "minLength": 1,
                                "maxLength": 120
                              },
                              "overlay_in_s": {
                                "type": "number",
                                "minimum": 0,
                                "default": 0.4
                              },
                              "overlay_out_s": {
                                "type": "number",
                                "minimum": 0
                              },
                              "voiceover_text": {
                                "type": "string",
                                "minLength": 1
                              },
                              "ig_optional": {
                                "type": "boolean",
                                "default": false
                              },
                              "audio": {
                                "type": "object",
                                "properties": {
                                  "strip_native_audio": {
                                    "type": "boolean",
                                    "default": false
                                  },
                                  "keep_native_sfx": {
                                    "type": "boolean",
                                    "default": true
                                  }
                                },
                                "default": {
                                  "strip_native_audio": false,
                                  "keep_native_sfx": true
                                }
                              },
                              "fact_confidence": {
                                "type": "string",
                                "enum": ["high", "medium", "low"]
                              },
                              "verify": {
                                "type": "string"
                              }
                            },
                            "required": ["id"]
                          },
                          "minItems": 1,
                          "maxItems": 6
                        },
                        "visual": {
                          "type": "object",
                          "properties": {
                            "mode": {
                              "type": "string"
                            }
                          },
                          "required": ["mode"]
                        },
                        "audio": {
                          "type": "object",
                          "properties": {
                            "voice": {
                              "type": "string",
                              "default": "bm_george"
                            },
                            "speed": {
                              "type": "number",
                              "minimum": 0.5,
                              "maximum": 2,
                              "default": 1
                            },
                            "music": {
                              "type": "object",
                              "properties": {
                                "file": {
                                  "type": "string"
                                },
                                "mood": {
                                  "type": "string"
                                },
                                "gain_db": {
                                  "type": "number",
                                  "default": -18
                                },
                                "duck": {
                                  "type": "boolean",
                                  "default": true
                                }
                              },
                              "default": {
                                "gain_db": -18,
                                "duck": true
                              }
                            }
                          },
                          "default": {
                            "voice": "bm_george",
                            "speed": 1,
                            "music": {
                              "gain_db": -18,
                              "duck": true
                            }
                          }
                        },
                        "end_card": {
                          "type": "object",
                          "properties": {
                            "subject": {
                              "type": "string",
                              "minLength": 1
                            },
                            "disclosure": {
                              "type": "string",
                              "minLength": 1
                            }
                          },
                          "required": ["subject", "disclosure"]
                        },
                        "watermark": {
                          "type": "object",
                          "properties": {
                            "text": {
                              "type": "string",
                              "default": "AI visualisation"
                            }
                          },
                          "default": {
                            "text": "AI visualisation"
                          }
                        },
                        "outputs": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          },
                          "minItems": 1
                        },
                        "captions": {
                          "type": "object",
                          "properties": {
                            "facebook": {
                              "type": "string"
                            },
                            "facebook_question": {
                              "type": "string"
                            },
                            "instagram": {
                              "type": "string"
                            },
                            "youtube_shorts_title": {
                              "type": "string"
                            },
                            "hashtags_facebook": {
                              "type": "array",
                              "items": {
                                "type": "string"
                              },
                              "default": []
                            },
                            "hashtags_instagram": {
                              "type": "array",
                              "items": {
                                "type": "string"
                              },
                              "default": []
                            }
                          },
                          "default": {}
                        },
                        "disclosure": {
                          "type": "boolean",
                          "default": true
                        },
                        "gates": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          },
                          "default": []
                        },
                        "publish": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          },
                          "default": []
                        },
                        "compilationTargetS": {
                          "type": "number",
                          "minimum": 0,
                          "exclusiveMinimum": true
                        }
                      },
                      "required": [
                        "version",
                        "projectRef",
                        "template",
                        "shots",
                        "visual",
                        "end_card",
                        "outputs"
                      ]
                    },
                    "status": {
                      "type": "string"
                    },
                    "created_at": {
                      "type": "string"
                    },
                    "updated_at": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "id",
                    "org_id",
                    "project_id",
                    "manifest",
                    "status",
                    "created_at",
                    "updated_at"
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Project not found",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  },
                  "required": ["error"]
                }
              }
            }
          }
        }
      },
      "get": {
        "parameters": [
          {
            "schema": {
              "type": "string",
              "minLength": 1
            },
            "required": true,
            "name": "project",
            "in": "query"
          }
        ],
        "responses": {
          "200": {
            "description": "Jobs for the project",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "string"
                      },
                      "org_id": {
                        "type": "string"
                      },
                      "project_id": {
                        "type": "string"
                      },
                      "manifest": {
                        "type": "object",
                        "properties": {
                          "version": {
                            "type": "string",
                            "enum": ["1"]
                          },
                          "projectRef": {
                            "type": "string",
                            "minLength": 1
                          },
                          "template": {
                            "type": "string",
                            "minLength": 1
                          },
                          "inputs": {
                            "type": "object",
                            "properties": {
                              "jobs": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "properties": {
                                    "kind": {
                                      "type": "string"
                                    },
                                    "ref": {
                                      "type": "string"
                                    }
                                  },
                                  "required": ["kind", "ref"]
                                },
                                "default": []
                              }
                            },
                            "default": {
                              "jobs": []
                            }
                          },
                          "shots": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "properties": {
                                "id": {
                                  "type": "string",
                                  "minLength": 1
                                },
                                "text": {
                                  "type": "string"
                                },
                                "image": {
                                  "type": "string"
                                },
                                "clip": {
                                  "type": "string"
                                },
                                "trim_in_s": {
                                  "type": "number",
                                  "minimum": 0,
                                  "default": 0
                                },
                                "speed": {
                                  "type": "number",
                                  "minimum": 0.25,
                                  "maximum": 4,
                                  "default": 1
                                },
                                "overlay_text": {
                                  "type": "string",
                                  "minLength": 1,
                                  "maxLength": 120
                                },
                                "overlay_in_s": {
                                  "type": "number",
                                  "minimum": 0,
                                  "default": 0.4
                                },
                                "overlay_out_s": {
                                  "type": "number",
                                  "minimum": 0
                                },
                                "voiceover_text": {
                                  "type": "string",
                                  "minLength": 1
                                },
                                "ig_optional": {
                                  "type": "boolean",
                                  "default": false
                                },
                                "audio": {
                                  "type": "object",
                                  "properties": {
                                    "strip_native_audio": {
                                      "type": "boolean",
                                      "default": false
                                    },
                                    "keep_native_sfx": {
                                      "type": "boolean",
                                      "default": true
                                    }
                                  },
                                  "default": {
                                    "strip_native_audio": false,
                                    "keep_native_sfx": true
                                  }
                                },
                                "fact_confidence": {
                                  "type": "string",
                                  "enum": ["high", "medium", "low"]
                                },
                                "verify": {
                                  "type": "string"
                                }
                              },
                              "required": ["id"]
                            },
                            "minItems": 1,
                            "maxItems": 6
                          },
                          "visual": {
                            "type": "object",
                            "properties": {
                              "mode": {
                                "type": "string"
                              }
                            },
                            "required": ["mode"]
                          },
                          "audio": {
                            "type": "object",
                            "properties": {
                              "voice": {
                                "type": "string",
                                "default": "bm_george"
                              },
                              "speed": {
                                "type": "number",
                                "minimum": 0.5,
                                "maximum": 2,
                                "default": 1
                              },
                              "music": {
                                "type": "object",
                                "properties": {
                                  "file": {
                                    "type": "string"
                                  },
                                  "mood": {
                                    "type": "string"
                                  },
                                  "gain_db": {
                                    "type": "number",
                                    "default": -18
                                  },
                                  "duck": {
                                    "type": "boolean",
                                    "default": true
                                  }
                                },
                                "default": {
                                  "gain_db": -18,
                                  "duck": true
                                }
                              }
                            },
                            "default": {
                              "voice": "bm_george",
                              "speed": 1,
                              "music": {
                                "gain_db": -18,
                                "duck": true
                              }
                            }
                          },
                          "end_card": {
                            "type": "object",
                            "properties": {
                              "subject": {
                                "type": "string",
                                "minLength": 1
                              },
                              "disclosure": {
                                "type": "string",
                                "minLength": 1
                              }
                            },
                            "required": ["subject", "disclosure"]
                          },
                          "watermark": {
                            "type": "object",
                            "properties": {
                              "text": {
                                "type": "string",
                                "default": "AI visualisation"
                              }
                            },
                            "default": {
                              "text": "AI visualisation"
                            }
                          },
                          "outputs": {
                            "type": "array",
                            "items": {
                              "type": "string"
                            },
                            "minItems": 1
                          },
                          "captions": {
                            "type": "object",
                            "properties": {
                              "facebook": {
                                "type": "string"
                              },
                              "facebook_question": {
                                "type": "string"
                              },
                              "instagram": {
                                "type": "string"
                              },
                              "youtube_shorts_title": {
                                "type": "string"
                              },
                              "hashtags_facebook": {
                                "type": "array",
                                "items": {
                                  "type": "string"
                                },
                                "default": []
                              },
                              "hashtags_instagram": {
                                "type": "array",
                                "items": {
                                  "type": "string"
                                },
                                "default": []
                              }
                            },
                            "default": {}
                          },
                          "disclosure": {
                            "type": "boolean",
                            "default": true
                          },
                          "gates": {
                            "type": "array",
                            "items": {
                              "type": "string"
                            },
                            "default": []
                          },
                          "publish": {
                            "type": "array",
                            "items": {
                              "type": "string"
                            },
                            "default": []
                          },
                          "compilationTargetS": {
                            "type": "number",
                            "minimum": 0,
                            "exclusiveMinimum": true
                          }
                        },
                        "required": [
                          "version",
                          "projectRef",
                          "template",
                          "shots",
                          "visual",
                          "end_card",
                          "outputs"
                        ]
                      },
                      "status": {
                        "type": "string"
                      },
                      "created_at": {
                        "type": "string"
                      },
                      "updated_at": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "id",
                      "org_id",
                      "project_id",
                      "manifest",
                      "status",
                      "created_at",
                      "updated_at"
                    ]
                  }
                }
              }
            }
          },
          "404": {
            "description": "Project not found",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  },
                  "required": ["error"]
                }
              }
            }
          }
        }
      }
    },
    "/jobs/{id}": {
      "get": {
        "parameters": [
          {
            "schema": {
              "type": "string"
            },
            "required": true,
            "name": "id",
            "in": "path"
          }
        ],
        "responses": {
          "200": {
            "description": "The job",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "org_id": {
                      "type": "string"
                    },
                    "project_id": {
                      "type": "string"
                    },
                    "manifest": {
                      "type": "object",
                      "properties": {
                        "version": {
                          "type": "string",
                          "enum": ["1"]
                        },
                        "projectRef": {
                          "type": "string",
                          "minLength": 1
                        },
                        "template": {
                          "type": "string",
                          "minLength": 1
                        },
                        "inputs": {
                          "type": "object",
                          "properties": {
                            "jobs": {
                              "type": "array",
                              "items": {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "type": "string"
                                  },
                                  "ref": {
                                    "type": "string"
                                  }
                                },
                                "required": ["kind", "ref"]
                              },
                              "default": []
                            }
                          },
                          "default": {
                            "jobs": []
                          }
                        },
                        "shots": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "properties": {
                              "id": {
                                "type": "string",
                                "minLength": 1
                              },
                              "text": {
                                "type": "string"
                              },
                              "image": {
                                "type": "string"
                              },
                              "clip": {
                                "type": "string"
                              },
                              "trim_in_s": {
                                "type": "number",
                                "minimum": 0,
                                "default": 0
                              },
                              "speed": {
                                "type": "number",
                                "minimum": 0.25,
                                "maximum": 4,
                                "default": 1
                              },
                              "overlay_text": {
                                "type": "string",
                                "minLength": 1,
                                "maxLength": 120
                              },
                              "overlay_in_s": {
                                "type": "number",
                                "minimum": 0,
                                "default": 0.4
                              },
                              "overlay_out_s": {
                                "type": "number",
                                "minimum": 0
                              },
                              "voiceover_text": {
                                "type": "string",
                                "minLength": 1
                              },
                              "ig_optional": {
                                "type": "boolean",
                                "default": false
                              },
                              "audio": {
                                "type": "object",
                                "properties": {
                                  "strip_native_audio": {
                                    "type": "boolean",
                                    "default": false
                                  },
                                  "keep_native_sfx": {
                                    "type": "boolean",
                                    "default": true
                                  }
                                },
                                "default": {
                                  "strip_native_audio": false,
                                  "keep_native_sfx": true
                                }
                              },
                              "fact_confidence": {
                                "type": "string",
                                "enum": ["high", "medium", "low"]
                              },
                              "verify": {
                                "type": "string"
                              }
                            },
                            "required": ["id"]
                          },
                          "minItems": 1,
                          "maxItems": 6
                        },
                        "visual": {
                          "type": "object",
                          "properties": {
                            "mode": {
                              "type": "string"
                            }
                          },
                          "required": ["mode"]
                        },
                        "audio": {
                          "type": "object",
                          "properties": {
                            "voice": {
                              "type": "string",
                              "default": "bm_george"
                            },
                            "speed": {
                              "type": "number",
                              "minimum": 0.5,
                              "maximum": 2,
                              "default": 1
                            },
                            "music": {
                              "type": "object",
                              "properties": {
                                "file": {
                                  "type": "string"
                                },
                                "mood": {
                                  "type": "string"
                                },
                                "gain_db": {
                                  "type": "number",
                                  "default": -18
                                },
                                "duck": {
                                  "type": "boolean",
                                  "default": true
                                }
                              },
                              "default": {
                                "gain_db": -18,
                                "duck": true
                              }
                            }
                          },
                          "default": {
                            "voice": "bm_george",
                            "speed": 1,
                            "music": {
                              "gain_db": -18,
                              "duck": true
                            }
                          }
                        },
                        "end_card": {
                          "type": "object",
                          "properties": {
                            "subject": {
                              "type": "string",
                              "minLength": 1
                            },
                            "disclosure": {
                              "type": "string",
                              "minLength": 1
                            }
                          },
                          "required": ["subject", "disclosure"]
                        },
                        "watermark": {
                          "type": "object",
                          "properties": {
                            "text": {
                              "type": "string",
                              "default": "AI visualisation"
                            }
                          },
                          "default": {
                            "text": "AI visualisation"
                          }
                        },
                        "outputs": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          },
                          "minItems": 1
                        },
                        "captions": {
                          "type": "object",
                          "properties": {
                            "facebook": {
                              "type": "string"
                            },
                            "facebook_question": {
                              "type": "string"
                            },
                            "instagram": {
                              "type": "string"
                            },
                            "youtube_shorts_title": {
                              "type": "string"
                            },
                            "hashtags_facebook": {
                              "type": "array",
                              "items": {
                                "type": "string"
                              },
                              "default": []
                            },
                            "hashtags_instagram": {
                              "type": "array",
                              "items": {
                                "type": "string"
                              },
                              "default": []
                            }
                          },
                          "default": {}
                        },
                        "disclosure": {
                          "type": "boolean",
                          "default": true
                        },
                        "gates": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          },
                          "default": []
                        },
                        "publish": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          },
                          "default": []
                        },
                        "compilationTargetS": {
                          "type": "number",
                          "minimum": 0,
                          "exclusiveMinimum": true
                        }
                      },
                      "required": [
                        "version",
                        "projectRef",
                        "template",
                        "shots",
                        "visual",
                        "end_card",
                        "outputs"
                      ]
                    },
                    "status": {
                      "type": "string"
                    },
                    "created_at": {
                      "type": "string"
                    },
                    "updated_at": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "id",
                    "org_id",
                    "project_id",
                    "manifest",
                    "status",
                    "created_at",
                    "updated_at"
                  ]
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  },
                  "required": ["error"]
                }
              }
            }
          }
        }
      }
    },
    "/jobs/{id}/assets": {
      "post": {
        "parameters": [
          {
            "schema": {
              "type": "string"
            },
            "required": true,
            "name": "id",
            "in": "path"
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "shotId": {
                    "type": "string",
                    "minLength": 1
                  },
                  "filename": {
                    "type": "string",
                    "minLength": 1
                  }
                },
                "required": ["shotId", "filename"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Presigned upload URL",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "url": {
                      "type": "string"
                    },
                    "key": {
                      "type": "string"
                    }
                  },
                  "required": ["url", "key"]
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  },
                  "required": ["error"]
                }
              }
            }
          }
        }
      }
    },
    "/jobs/{id}/approve": {
      "post": {
        "parameters": [
          {
            "schema": {
              "type": "string"
            },
            "required": true,
            "name": "id",
            "in": "path"
          }
        ],
        "responses": {
          "200": {
            "description": "Approved, now running",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "org_id": {
                      "type": "string"
                    },
                    "project_id": {
                      "type": "string"
                    },
                    "manifest": {
                      "type": "object",
                      "properties": {
                        "version": {
                          "type": "string",
                          "enum": ["1"]
                        },
                        "projectRef": {
                          "type": "string",
                          "minLength": 1
                        },
                        "template": {
                          "type": "string",
                          "minLength": 1
                        },
                        "inputs": {
                          "type": "object",
                          "properties": {
                            "jobs": {
                              "type": "array",
                              "items": {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "type": "string"
                                  },
                                  "ref": {
                                    "type": "string"
                                  }
                                },
                                "required": ["kind", "ref"]
                              },
                              "default": []
                            }
                          },
                          "default": {
                            "jobs": []
                          }
                        },
                        "shots": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "properties": {
                              "id": {
                                "type": "string",
                                "minLength": 1
                              },
                              "text": {
                                "type": "string"
                              },
                              "image": {
                                "type": "string"
                              },
                              "clip": {
                                "type": "string"
                              },
                              "trim_in_s": {
                                "type": "number",
                                "minimum": 0,
                                "default": 0
                              },
                              "speed": {
                                "type": "number",
                                "minimum": 0.25,
                                "maximum": 4,
                                "default": 1
                              },
                              "overlay_text": {
                                "type": "string",
                                "minLength": 1,
                                "maxLength": 120
                              },
                              "overlay_in_s": {
                                "type": "number",
                                "minimum": 0,
                                "default": 0.4
                              },
                              "overlay_out_s": {
                                "type": "number",
                                "minimum": 0
                              },
                              "voiceover_text": {
                                "type": "string",
                                "minLength": 1
                              },
                              "ig_optional": {
                                "type": "boolean",
                                "default": false
                              },
                              "audio": {
                                "type": "object",
                                "properties": {
                                  "strip_native_audio": {
                                    "type": "boolean",
                                    "default": false
                                  },
                                  "keep_native_sfx": {
                                    "type": "boolean",
                                    "default": true
                                  }
                                },
                                "default": {
                                  "strip_native_audio": false,
                                  "keep_native_sfx": true
                                }
                              },
                              "fact_confidence": {
                                "type": "string",
                                "enum": ["high", "medium", "low"]
                              },
                              "verify": {
                                "type": "string"
                              }
                            },
                            "required": ["id"]
                          },
                          "minItems": 1,
                          "maxItems": 6
                        },
                        "visual": {
                          "type": "object",
                          "properties": {
                            "mode": {
                              "type": "string"
                            }
                          },
                          "required": ["mode"]
                        },
                        "audio": {
                          "type": "object",
                          "properties": {
                            "voice": {
                              "type": "string",
                              "default": "bm_george"
                            },
                            "speed": {
                              "type": "number",
                              "minimum": 0.5,
                              "maximum": 2,
                              "default": 1
                            },
                            "music": {
                              "type": "object",
                              "properties": {
                                "file": {
                                  "type": "string"
                                },
                                "mood": {
                                  "type": "string"
                                },
                                "gain_db": {
                                  "type": "number",
                                  "default": -18
                                },
                                "duck": {
                                  "type": "boolean",
                                  "default": true
                                }
                              },
                              "default": {
                                "gain_db": -18,
                                "duck": true
                              }
                            }
                          },
                          "default": {
                            "voice": "bm_george",
                            "speed": 1,
                            "music": {
                              "gain_db": -18,
                              "duck": true
                            }
                          }
                        },
                        "end_card": {
                          "type": "object",
                          "properties": {
                            "subject": {
                              "type": "string",
                              "minLength": 1
                            },
                            "disclosure": {
                              "type": "string",
                              "minLength": 1
                            }
                          },
                          "required": ["subject", "disclosure"]
                        },
                        "watermark": {
                          "type": "object",
                          "properties": {
                            "text": {
                              "type": "string",
                              "default": "AI visualisation"
                            }
                          },
                          "default": {
                            "text": "AI visualisation"
                          }
                        },
                        "outputs": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          },
                          "minItems": 1
                        },
                        "captions": {
                          "type": "object",
                          "properties": {
                            "facebook": {
                              "type": "string"
                            },
                            "facebook_question": {
                              "type": "string"
                            },
                            "instagram": {
                              "type": "string"
                            },
                            "youtube_shorts_title": {
                              "type": "string"
                            },
                            "hashtags_facebook": {
                              "type": "array",
                              "items": {
                                "type": "string"
                              },
                              "default": []
                            },
                            "hashtags_instagram": {
                              "type": "array",
                              "items": {
                                "type": "string"
                              },
                              "default": []
                            }
                          },
                          "default": {}
                        },
                        "disclosure": {
                          "type": "boolean",
                          "default": true
                        },
                        "gates": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          },
                          "default": []
                        },
                        "publish": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          },
                          "default": []
                        },
                        "compilationTargetS": {
                          "type": "number",
                          "minimum": 0,
                          "exclusiveMinimum": true
                        }
                      },
                      "required": [
                        "version",
                        "projectRef",
                        "template",
                        "shots",
                        "visual",
                        "end_card",
                        "outputs"
                      ]
                    },
                    "status": {
                      "type": "string"
                    },
                    "created_at": {
                      "type": "string"
                    },
                    "updated_at": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "id",
                    "org_id",
                    "project_id",
                    "manifest",
                    "status",
                    "created_at",
                    "updated_at"
                  ]
                }
              }
            }
          },
          "400": {
            "description": "Not awaiting review",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  },
                  "required": ["error"]
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  },
                  "required": ["error"]
                }
              }
            }
          }
        }
      }
    },
    "/jobs/{id}/dispatch": {
      "post": {
        "parameters": [
          {
            "schema": {
              "type": "string"
            },
            "required": true,
            "name": "id",
            "in": "path"
          }
        ],
        "responses": {
          "200": {
            "description": "Dispatched (or already was)",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "dispatched": {
                      "type": "boolean"
                    }
                  },
                  "required": ["dispatched"]
                }
              }
            }
          },
          "400": {
            "description": "Not queued",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  },
                  "required": ["error"]
                }
              }
            }
          },
          "404": {
            "description": "Not found",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  },
                  "required": ["error"]
                }
              }
            }
          }
        }
      }
    }
  }
}
```
