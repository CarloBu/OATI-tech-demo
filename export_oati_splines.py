

import json
import os
from datetime import datetime

# Try to import 3ds Max Python API
try:
    import pymxs
    rt = pymxs.runtime
    HAS_PYTHON = True
    print("PyMXS API available")
except ImportError:
    HAS_PYTHON = False
    print("ERROR: PyMXS not available - this script requires 3ds Max with Python support")
    exit()

def export_oati_splines():
    """Export all splines to public/oati.json"""
    if not HAS_PYTHON:
        print("ERROR: PyMXS not available")
        return False
    
    try:
        print("="*60)
        print("OATI Spline Animation Exporter")
        print("="*60)
        
        # Get all spline objects in the scene
        splines = []
        for obj in rt.objects:
            # Check for various spline types
            obj_class = rt.classof(obj.baseobject)
            if (obj_class == rt.SplineShape or 
                obj_class == rt.Line or 
                obj_class == rt.Circle or 
                obj_class == rt.Arc or 
                obj_class == rt.Rectangle or 
                obj_class == rt.Ellipse or 
                obj_class == rt.NGon or 
                obj_class == rt.Star or 
                obj_class == rt.Helix):
                splines.append(obj)
                print(f"Found spline: {obj.name} (type: {obj_class})")
        
        if not splines:
            print("No spline objects found in the scene")
            rt.messageBox("No spline objects found in the scene")
            return False
        
        print(f"Found {len(splines)} spline object(s)")
        
        # Get animation settings from current timeline
        start_frame = int(rt.animationRange.start / rt.ticksPerFrame)
        end_frame = int(rt.animationRange.end / rt.ticksPerFrame)
        frame_rate = rt.frameRate
        
        print(f"Animation range: {start_frame} to {end_frame}")
        print(f"Frame rate: {frame_rate}")
        
        # Function to collect keyframes for an object and its modifiers
        def get_object_keyframes(obj, start_frame, end_frame):
            """Collect all keyframe times for an object's animation controllers and modifiers"""
            keyframes = set()
            keyframes.add(start_frame)  # Always include start frame
            keyframes.add(end_frame)    # Always include end frame
            
            def extract_keys_from_controller(controller, controller_name=""):
                """Helper function to extract keys from a controller"""
                try:
                    if controller and hasattr(controller, 'keys'):
                        for key in controller.keys:
                            frame_time = int(key.time / rt.ticksPerFrame)
                            if start_frame <= frame_time <= end_frame:
                                keyframes.add(frame_time)
                                if controller_name:
                                    print(f"    - Found key at frame {frame_time} on {controller_name}")
                except:
                    pass
            
            try:
                # Check transform controllers (position, rotation, scale)
                extract_keys_from_controller(obj.controller, "transform")
                extract_keys_from_controller(obj.pos.controller, "position")
                extract_keys_from_controller(obj.rotation.controller, "rotation")
                extract_keys_from_controller(obj.scale.controller, "scale")
                
                # Check modifier stack BEFORE any conversion
                if hasattr(obj, 'modifiers') and obj.modifiers:
                    print(f"    - Checking {len(obj.modifiers)} modifier(s)")
                    for i, modifier in enumerate(obj.modifiers):
                        mod_name = str(modifier)
                        print(f"      - Modifier {i}: {mod_name}")
                        
                        # Check if modifier has keyframes
                        try:
                            # Check for parameter controllers on the modifier
                            if hasattr(modifier, 'parameterBlock'):
                                for param_idx in range(modifier.parameterBlock.numParams):
                                    try:
                                        param_name = modifier.parameterBlock.getParamName(param_idx)
                                        param_controller = modifier.parameterBlock.getController(param_idx)
                                        extract_keys_from_controller(param_controller, f"{mod_name}.{param_name}")
                                    except:
                                        pass
                            
                            # Special handling for common modifiers
                            if hasattr(modifier, 'angle') and hasattr(modifier.angle, 'controller'):
                                extract_keys_from_controller(modifier.angle.controller, f"{mod_name}.angle")
                            
                            if hasattr(modifier, 'twist') and hasattr(modifier.twist, 'controller'):
                                extract_keys_from_controller(modifier.twist.controller, f"{mod_name}.twist")
                            
                            if hasattr(modifier, 'amount') and hasattr(modifier.amount, 'controller'):
                                extract_keys_from_controller(modifier.amount.controller, f"{mod_name}.amount")
                            
                            # For Spline Edit modifier - check sub-object level animation
                            if "Edit_Spline" in mod_name or "SplineShape" in mod_name:
                                # These might have vertex-level animation that's harder to detect
                                # We'll sample more densely for these cases
                                print(f"        - Detected spline edit modifier, will sample more frames")
                        
                        except Exception as e:
                            print(f"        - Warning: Could not check modifier {mod_name}: {str(e)}")
                
                # Check for spline-specific animation on base object
                if hasattr(obj, 'baseobject') and obj.baseobject:
                    base_obj = obj.baseobject
                    extract_keys_from_controller(base_obj.controller, "baseObject")
                
            except Exception as e:
                print(f"  Warning: Could not extract keyframes from {obj.name}: {str(e)}")
            
            # If we only have start/end frames and there are modifiers, add some intermediate frames
            if len(keyframes) == 2 and hasattr(obj, 'modifiers') and len(obj.modifiers) > 0:
                print(f"    - No explicit keyframes found, adding intermediate frames for modifier sampling")
                # Add some intermediate frames to catch modifier animation
                frame_range = end_frame - start_frame
                if frame_range > 10:
                    step = max(1, frame_range // 10)  # Sample at most 10 frames
                    for f in range(start_frame + step, end_frame, step):
                        keyframes.add(f)
            
            return sorted(list(keyframes))
        
        # Set output path - use absolute path to project directory
        project_dir = r"D:\dev\OATI-demo"
        output_path = os.path.join(project_dir, "public", "oati.json")
        print(f"Output file: {output_path}")
        
        # Process splines
        splines_data = []
        
        for i, spline in enumerate(splines):
            print(f"Processing spline {i+1}/{len(splines)}: {spline.name}")
            
            # Get keyframes for this spline BEFORE any conversions
            keyframes = get_object_keyframes(spline, start_frame, end_frame)
            print(f"  - Found {len(keyframes)} keyframes: {keyframes}")
            
            frames_data = []
            
            for current_frame in keyframes:
                # Set time to current frame
                rt.sliderTime = current_frame
                
                # Extract Bezier curve data from this spline at this frame
                spline_curves = []
                try:
                    # Work with a copy to avoid modifying the original
                    spline_copy = None
                    original_spline = spline
                    
                    # Convert to SplineShape if needed (on a copy)
                    if rt.classof(spline.baseobject) != rt.SplineShape:
                        # Create a snapshot/copy of the object at this frame to avoid collapsing the original
                        spline_copy = rt.snapshot(spline)
                        if spline_copy and rt.classof(spline_copy.baseobject) != rt.SplineShape:
                            rt.convertToSplineShape(spline_copy)
                        spline = spline_copy if spline_copy else spline
                    else:
                        spline_copy = spline
                    
                    spline_count = rt.numSplines(spline)
                    for s in range(1, spline_count + 1):
                        knot_count = rt.numKnots(spline, s)
                        curve_points = []
                        
                        for k in range(1, knot_count + 1):
                            # Get knot position
                            knot_pos = rt.getKnotPoint(spline, s, k)
                            world_knot = knot_pos * spline.transform
                            
                            # Get Bezier handles
                            in_handle = rt.getInVec(spline, s, k)
                            out_handle = rt.getOutVec(spline, s, k)
                            
                            world_in = in_handle * spline.transform
                            world_out = out_handle * spline.transform
                            
                            # Convert coordinates (3ds Max Z-up to Three.js Y-up)
                            knot_x, knot_y, knot_z = world_knot.x, world_knot.z, -world_knot.y
                            in_x, in_y, in_z = world_in.x, world_in.z, -world_in.y
                            out_x, out_y, out_z = world_out.x, world_out.z, -world_out.y
                            
                            curve_points.append({
                                'knot': {
                                    'x': round(knot_x, 6),
                                    'y': round(knot_y, 6),
                                    'z': round(knot_z, 6)
                                },
                                'inHandle': {
                                    'x': round(in_x, 6),
                                    'y': round(in_y, 6),
                                    'z': round(in_z, 6)
                                },
                                'outHandle': {
                                    'x': round(out_x, 6),
                                    'y': round(out_y, 6),
                                    'z': round(out_z, 6)
                                }
                            })
                        
                        if curve_points:
                            spline_curves.append({
                                'splineIndex': s,
                                'points': curve_points
                            })
                    
                    # Clean up temporary copy
                    if spline_copy and spline_copy != original_spline:
                        try:
                            rt.delete(spline_copy)
                        except:
                            pass
                    
                    # Restore original spline reference
                    spline = original_spline
                            
                except Exception as e:
                    # Clean up on error
                    if 'spline_copy' in locals() and spline_copy and spline_copy != original_spline:
                        try:
                            rt.delete(spline_copy)
                        except:
                            pass
                    spline = original_spline
                    
                    print(f"  Warning: Could not extract Bezier data from {spline.name} at frame {current_frame}: {str(e)}")
                    # Fallback to simple knot points if Bezier extraction fails
                    try:
                        simple_points = []
                        spline_count = rt.numSplines(spline)
                        for s in range(1, spline_count + 1):
                            knot_count = rt.numKnots(spline, s)
                            for k in range(1, knot_count + 1):
                                knot_pos = rt.getKnotPoint(spline, s, k)
                                world_pos = knot_pos * spline.transform
                                x, y, z = world_pos.x, world_pos.z, -world_pos.y
                                simple_points.append({
                                    'x': round(x, 6),
                                    'y': round(y, 6),
                                    'z': round(z, 6)
                                })
                        if simple_points:
                            spline_curves.append({
                                'splineIndex': 1,
                                'points': [{'knot': p, 'inHandle': p, 'outHandle': p} for p in simple_points]
                            })
                    except:
                        pass
                
                if spline_curves:
                    frames_data.append({
                        'frame': current_frame,
                        'time': current_frame / float(frame_rate),
                        'curves': spline_curves,
                        'isKeyframe': True  # Mark as keyframe
                    })
            
            if frames_data:
                splines_data.append({
                    'name': str(spline.name),
                    'frames': frames_data
                })
                print(f"  - Extracted {len(frames_data)} frames")
            else:
                print(f"  - No valid frames extracted")
        
        if not splines_data:
            print("No valid spline data found")
            rt.messageBox("No valid spline data found")
            return False
        
        # Create JSON data structure
        json_data = {
            'metadata': {
                'version': '1.2',
                'generator': '3ds Max OATI Spline Exporter (Keyframe Optimized)',
                'frameStart': start_frame,
                'frameEnd': end_frame,
                'exportType': 'keyframes',
                'frameRate': frame_rate,
                'closed': False,
                'exportDate': datetime.now().isoformat(),
                'coordinateSystem': 'threejs',
                'curveType': 'bezier',
                'description': 'Exports Bezier curve data at animation keyframes only for optimized file size and performance. Supports modifier stack animations including Spline Edit and Twist modifiers.'
            },
            'splines': splines_data
        }
        
        # Ensure output directory exists
        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            try:
                os.makedirs(output_dir)
                print(f"Created directory: {output_dir}")
            except Exception as e:
                print(f"Could not create directory {output_dir}: {str(e)}")
                # Fallback to Desktop if project directory fails
                output_path = os.path.join(os.path.expanduser("~"), "Desktop", "oati.json")
                print(f"Falling back to Desktop: {output_path}")
        
        # Write JSON file
        with open(output_path, 'w') as f:
            json.dump(json_data, f, indent=4)
        
        # Calculate total keyframes exported
        total_keyframes = sum(len(spline['frames']) for spline in splines_data)
        
        print(f"\nKeyframe export completed successfully!")
        print(f"  - {len(splines_data)} spline(s) exported")
        print(f"  - {total_keyframes} total keyframes exported")
        print(f"  - Average {total_keyframes / len(splines_data):.1f} keyframes per spline")
        print(f"  - File saved to: {os.path.abspath(output_path)}")
        
        # Show success message
        rt.messageBox(f"Keyframe export completed successfully!\n\nExported {len(splines_data)} spline(s)\n{total_keyframes} total keyframes\nFile saved to: {os.path.abspath(output_path)}")
        
        return True
        
    except Exception as e:
        print(f"Export failed: {str(e)}")
        import traceback
        traceback.print_exc()
        rt.messageBox(f"Export failed: {str(e)}")
        return False

# Auto-run the export when script is executed
if __name__ == "__main__":
    print("Starting OATI spline export...")
    export_oati_splines()
