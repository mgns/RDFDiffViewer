package models;

import java.io.File;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

import play.Play;

/**
 * Offers static methods to obtain triple files from file system
 * 
 * @author Martin
 *
 */
public class Triple {

    private static final File dataFolder = new File(Play.application().configuration().getString("dataFolder"));
    private static final List<String> versions = Play.application().configuration().getStringList("versions");

	/**
	 * Returns all versions a DBpedia entity is present in
	 * @param entity	Name of the entity without prefix (e.g. "Vodafone")
	 * @return	Sorted list of version numbers
	 */
	public static List<String> getVersionsForEntity(String entity) {
		LinkedList<String> result = new LinkedList<String>();
		//for each version, represented as folder, look up if entity file is present
		for (String version : versions) {
            Path versionPath = Paths.get(dataFolder.getAbsolutePath(), version);

		    String entityFilePath = getFilePathForVersionPath(versionPath.toString(), entity);
		    File entityFile = new File(entityFilePath);
		    if (entityFile.exists())
		    	result.add(version);
		}
		return result;
	}

    /**
     * Returns all known versions
     * @return
     */
    public static List<String> getAllVersions() {
        return Play.application().configuration().getStringList("versions");
    }

	//builds part of path between version folder and entity file (e.g. /dbr/VO/Vodafone)
	public static String getFilePathForVersionPath(String versionPath, String entity) {
		return  versionPath + "/dbr/"
	    		+ entity.substring(0, 2).toUpperCase()+"/"
	    		+ entity;
	}
}
